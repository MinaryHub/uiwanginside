import { after } from "next/server";
import { timedFetch, ok, fail, createTtlCache } from "@/lib/fetcher";
import { fetchOverpassPlaces } from "@/lib/overpass";
import { haversine, isInsideUiwang } from "@/lib/geo";
import { UIWANG, CATEGORY_MAP, type CategoryKey } from "@/lib/uiwang";
import { UIWANG_BBOX } from "@/lib/uiwang-boundary";
import { facilityPlaces, type FacilityKind } from "@/lib/facilities";
import { loadFactories } from "@/lib/factoryApi";
import { UIWANG_FACTORIES } from "@/lib/uiwang-factories";
import type { Place, PlaceSource } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 25;

interface KakaoDoc {
  id: string;
  place_name: string;
  category_group_code: string;
  category_name: string;
  phone: string;
  address_name: string;
  road_address_name: string;
  x: string;
  y: string;
  distance: string;
  place_url: string;
}

const PER_PAGE = 15;
const MAX_PAGES = 3;
/** 추가 페이지 요청 상한 — 조밀한 화면에서 호출이 폭발하지 않게 막는다 */
const EXTRA_BUDGET = 24;
/** 단일 요청 최대 카테고리 수 */
const MAX_CATEGORIES = 12;

function gridFor(rect: string): number {
  const [minX, , maxX] = rect.split(",").map(Number);
  const km = (maxX - minX) * 88; // 위도 37도에서 경도 1도 ≈ 88km
  if (km < 0.8) return 1;
  if (km < 1.6) return 2;
  if (km < 3) return 3;
  return 4;
}

/**
 * 화면 범위를 의왕시 경계 상자로 잘라낸다.
 * 잘못된 숫자(NaN)이거나 시 경계와 겹치지 않으면 null 을 반환한다.
 */
function clipToCity(rect: string): string | null {
  const parts = rect.split(",").map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) return null;
  const [minX, minY, maxX, maxY] = parts;
  if (maxX <= minX || maxY <= minY) return null;
  const x0 = Math.max(minX, UIWANG_BBOX.minLng);
  const y0 = Math.max(minY, UIWANG_BBOX.minLat);
  const x1 = Math.min(maxX, UIWANG_BBOX.maxLng);
  const y1 = Math.min(maxY, UIWANG_BBOX.maxLat);
  if (x1 <= x0 || y1 <= y0) return null;
  return `${x0},${y0},${x1},${y1}`;
}

/** 캐시 키용 3자리 반올림(~100m 격자) */
function roundRect(rect: string): string {
  return rect
    .split(",")
    .map((v) => Number(v).toFixed(3))
    .join(",");
}

function tiles(rect: string, n: number): string[] {
  const [minX, minY, maxX, maxY] = rect.split(",").map(Number);
  const w = (maxX - minX) / n;
  const h = (maxY - minY) / n;
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const a = minX + i * w;
      const b = minY + j * h;
      const c = a + w;
      const d = b + h;
      const probes: [number, number][] = [
        [b, a], [b, c], [d, a], [d, c],
        [(b + d) / 2, (a + c) / 2],
        [b, (a + c) / 2], [d, (a + c) / 2],
        [(b + d) / 2, a], [(b + d) / 2, c],
      ];
      if (!probes.some(([lat, lng]) => isInsideUiwang(lat, lng))) continue;
      out.push(`${a},${b},${c},${d}`);
    }
  }
  return out;
}

async function fetchPage(
  key: string,
  code: CategoryKey,
  rect: string,
  page: number,
): Promise<{ docs: KakaoDoc[]; total: number }> {
  const url =
    `https://dapi.kakao.com/v2/local/search/category.json` +
    `?category_group_code=${code}&rect=${rect}` +
    `&size=${PER_PAGE}&page=${page}&sort=accuracy`;
  const res = await timedFetch(url, { headers: { Authorization: `KakaoAK ${key}` } });
  if (!res.ok) {
    throw new Error(`kakao ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  const json = (await res.json()) as {
    documents: KakaoDoc[];
    meta: { total_count: number };
  };
  return { docs: json.documents, total: json.meta.total_count };
}

async function searchCategory(
  key: string,
  code: CategoryKey,
  rect: string,
  center: { lat: number; lng: number },
): Promise<{ places: Place[]; total: number }> {
  const cells = tiles(rect, gridFor(rect));

  const first = await Promise.all(cells.map((c) => fetchPage(key, code, c, 1)));

  const extra: { cell: string; page: number }[] = [];
  first.forEach((r, i) => {
    const pages = Math.min(MAX_PAGES, Math.ceil(r.total / PER_PAGE));
    for (let p = 2; p <= pages; p++) extra.push({ cell: cells[i], page: p });
  });
  extra.sort((a, b) => a.page - b.page);
  const rest = await Promise.all(
    extra.slice(0, EXTRA_BUDGET).map((e) => fetchPage(key, code, e.cell, e.page)),
  );

  const seen = new Set<string>();
  const places: Place[] = [];
  for (const { docs } of [...first, ...rest]) {
    for (const d of docs) {
      if (seen.has(d.id)) continue;
      seen.add(d.id);
      if (!isInsideUiwang(Number(d.y), Number(d.x))) continue;
      places.push({
        id: d.id,
        name: d.place_name,
        category: code,
        categoryName: d.category_name,
        phone: d.phone,
        address: d.address_name,
        roadAddress: d.road_address_name,
        lat: Number(d.y),
        lng: Number(d.x),
        distance: haversine(center.lat, center.lng, Number(d.y), Number(d.x)),
        url: d.place_url,
      });
    }
  }
  const total = first.reduce((s, r) => {
    if (r.docs.length === 0) return s;
    const inCity = r.docs.filter((d) => isInsideUiwang(Number(d.y), Number(d.x))).length;
    return s + Math.round(r.total * (inCity / r.docs.length));
  }, 0);
  return { places, total };
}

/**
 * 5분 캐시. 좌표는 소수점 3자리(약 100m)로 뭉뚱그려 키를 만든다.
 */
const cache = createTtlCache<{
  places: Place[];
  source: PlaceSource;
  total: number;
  notice?: string;
}>(5 * 60_000);
const CACHE_TTL_SEC = 300;

export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const wanted = [
    ...new Set(
      (sp.get("categories") ?? "SC4,HP8,MT1,CS2")
        .split(",")
        .filter((c): c is CategoryKey => c in CATEGORY_MAP),
    ),
  ].slice(0, MAX_CATEGORIES);

  const FACILITY: readonly string[] = ["PARK", "PKG", "WC", "SEC", "MFG"];
  const facilityKinds = wanted.filter((c): c is FacilityKind => FACILITY.includes(c));
  // ETC 는 카카오·OSM 카테고리가 아니므로 제외한다
  const codes = wanted.filter((c) => !FACILITY.includes(c) && c !== "ETC");

  const rawLat = Number(sp.get("lat") ?? UIWANG.center.lat);
  const rawLng = Number(sp.get("lng") ?? UIWANG.center.lng);
  const lat = Number.isFinite(rawLat) && rawLat >= 33 && rawLat <= 39 ? rawLat : UIWANG.center.lat;
  const lng = Number.isFinite(rawLng) && rawLng >= 124 && rawLng <= 132 ? rawLng : UIWANG.center.lng;
  const rawRadius = Number(sp.get("radius") ?? UIWANG.defaultRadius);
  const radius = Number.isFinite(rawRadius)
    ? Math.max(200, Math.min(rawRadius, 20_000))
    : UIWANG.defaultRadius;

  const rectParam = sp.get("rect");
  const dLat = radius / 111_000;
  const dLng = radius / 88_000;
  const asked =
    rectParam && rectParam.split(",").length === 4
      ? rectParam
      : `${lng - dLng},${lat - dLat},${lng + dLng},${lat + dLat}`;

  // 의왕 밖은 애초에 찾지 않는다
  const rect = clipToCity(asked);
  if (!rect) {
    return ok(
      { places: [] as Place[], source: "public" as PlaceSource, total: 0 },
      undefined,
      CACHE_TTL_SEC,
    );
  }

  let dynamicFactories;
  if (facilityKinds.includes("MFG") && UIWANG_FACTORIES.length === 0) {
    try {
      const f = await loadFactories((work) => after(work));
      dynamicFactories = f.factories;
    } catch (e) {
      console.warn("[places:factories]", e instanceof Error ? e.message : e);
    }
  }

  const facilities = facilityKinds.length
    ? facilityPlaces(facilityKinds, { lat, lng }, rect, dynamicFactories)
    : [];

  if (codes.length === 0) {
    return ok(
      { places: facilities, source: "public" as PlaceSource, total: facilities.length },
      undefined,
      CACHE_TTL_SEC,
    );
  }

  const cacheKey = `${wanted.slice().sort().join(",")}|${roundRect(rect)}`;
  const cached = cache.get(cacheKey);
  if (cached) {
    const places = cached.places
      .map((p) => ({ ...p, distance: haversine(lat, lng, p.lat, p.lng) }))
      .sort((a, b) => (a.distance ?? 0) - (b.distance ?? 0));
    return ok(
      { places, source: cached.source, total: cached.total },
      cached.notice,
      cached.source === "kakao" ? CACHE_TTL_SEC : undefined,
    );
  }

  const key = process.env.KAKAO_REST_KEY;

  // 1순위: 카카오 로컬 (전화번호·상세페이지까지 제공)
  if (key) {
    try {
      const results = await Promise.all(
        codes.map((c) => searchCategory(key, c, rect, { lat, lng })),
      );
      const places = [...results.flatMap((r) => r.places), ...facilities];
      places.sort((a, b) => (a.distance ?? 0) - (b.distance ?? 0));
      const payload = {
        places,
        source: "kakao" as const,
        total: results.reduce((s, r) => s + r.total, 0) + facilities.length,
      };
      cache.set(cacheKey, payload);
      return ok(payload, undefined, CACHE_TTL_SEC);
    } catch (e) {
      console.error("[places:kakao]", e);
    }
  }

  // 2순위: OpenStreetMap — 무인증이지만 샘플이 아닌 실제 데이터
  try {
    const places = [
      ...(await fetchOverpassPlaces(codes, rect, { lat, lng })).filter((p) =>
        isInsideUiwang(p.lat, p.lng),
      ),
      ...facilities,
    ];
    places.sort((a, b) => (a.distance ?? 0) - (b.distance ?? 0));
    const notice = key
      ? "카카오 로컬 호출에 실패해 OpenStreetMap 데이터로 대체했습니다. (© OpenStreetMap contributors)"
      : "KAKAO_REST_KEY 미설정 — OpenStreetMap 실제 데이터로 표시 중입니다. (© OpenStreetMap contributors)";
    cache.set(cacheKey, { places, source: "osm", total: places.length, notice });
    return ok({ places, source: "osm" as const, total: places.length }, notice);
  } catch (e) {
    console.error("[places:osm]", e);
    if (facilities.length > 0) {
      return ok(
        { places: facilities, source: "public" as PlaceSource, total: facilities.length },
        "카카오·OpenStreetMap 조회에 실패해 공공 표준데이터 시설만 표시합니다.",
      );
    }
    return fail(
      { places: [], source: "osm" as const, total: 0 },
      "카카오·OpenStreetMap 모두 조회에 실패했습니다.",
    );
  }
}
