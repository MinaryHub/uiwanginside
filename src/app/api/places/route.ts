import { timedFetch, ok, fail, createTtlCache } from "@/lib/fetcher";
import { fetchOverpassPlaces } from "@/lib/overpass";
import { haversine } from "@/lib/busStations";
import { UIWANG, CATEGORY_MAP, type CategoryKey } from "@/lib/uiwang";
import { UIWANG_BBOX } from "@/lib/uiwang-boundary";
import { isInsideUiwang } from "@/lib/geo";
import { facilityPlaces, type FacilityKind } from "@/lib/facilities";
import type { Place } from "@/lib/types";

export const dynamic = "force-dynamic";

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

/**
 * 카카오 로컬의 한도는 조회 한 번당 45곳이다 (15건 × 3페이지).
 * 조건을 어떻게 주든 그 이상은 오지 않는다. 실측하면 이렇다.
 *
 *   시청 주변 한 화면(약 2.4km) 음식점 total_count 547 / pageable_count 45
 *
 * 그래서 화면 전체를 한 번에 조회하면 547곳 중 45곳만 받는다. 어디를
 * 주든 화면은 비어 보인다. 화면을 격자로 쪼개 칸마다 따로 조회하면
 * 칸마다 45곳 한도가 새로 생겨 화면 전체가 고르게 찬다.
 */
const PER_PAGE = 15;
const MAX_PAGES = 3;
/** 추가 페이지 요청 상한 — 조밀한 화면에서 호출이 폭발하지 않게 막는다 */
const EXTRA_BUDGET = 24;

/**
 * 몇 칸으로 쪼갤지는 화면 크기가 정한다.
 *
 * 좁게 확대한 화면은 그 안의 총 개수부터 적어 45곳 한도에 걸리지 않는다.
 * 거기서까지 잘게 쪼개면 다섯 곳 찾자고 32번을 부르는 꼴이 된다.
 * 넓은 화면일수록 잘게 쪼갠다.
 */
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
 *
 * 의왕 포털이므로 군포·안양 가게는 보여주지 않는다. 화면을 넓게 빼면
 * 절반 넘게가 이웃 도시 것이었다 (실측: 1,141곳 중 722곳).
 * 조회 전에 잘라내면 헛된 호출도 함께 줄어든다.
 * 겹치지 않으면 null — 화면이 통째로 의왕 밖이라는 뜻이다.
 */
function clipToCity(rect: string): string | null {
  const [minX, minY, maxX, maxY] = rect.split(",").map(Number);
  const x0 = Math.max(minX, UIWANG_BBOX.minLng);
  const y0 = Math.max(minY, UIWANG_BBOX.minLat);
  const x1 = Math.min(maxX, UIWANG_BBOX.maxLng);
  const y1 = Math.min(maxY, UIWANG_BBOX.maxLat);
  if (x1 <= x0 || y1 <= y0) return null;
  return `${x0},${y0},${x1},${y1}`;
}

/**
 * rect 를 n×n 으로 쪼갠다.
 *
 * 경계 상자는 사각형이고 시 경계는 그렇지 않다. 네 귀퉁이가 모두
 * 시 밖인 칸은 조회해 봐야 버릴 것만 나오므로 건너뛴다.
 * 다만 칸이 시를 가로지르는 경우가 있어, 변의 중점까지 함께 본다.
 */
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
        [b, a], [b, c], [d, a], [d, c],           // 네 귀퉁이
        [(b + d) / 2, (a + c) / 2],                // 가운데
        [b, (a + c) / 2], [d, (a + c) / 2],        // 위·아래 변 중점
        [(b + d) / 2, a], [(b + d) / 2, c],        // 좌·우 변 중점
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
  // sort=accuracy — 거리순으로 받으면 칸 안에서도 한쪽으로 쏠린다.
  // 목록 정렬은 아래에서 직접 잰 거리로 한다.
  const url =
    `https://dapi.kakao.com/v2/local/search/category.json` +
    `?category_group_code=${code}&rect=${rect}` +
    `&size=${PER_PAGE}&page=${page}&sort=accuracy`;
  const res = await timedFetch(url, { headers: { Authorization: `KakaoAK ${key}` } });
  // 오류를 삼키면 "결과 0건" 으로 둔갑해 OSM 폴백이 동작하지 않는다.
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

  // 1차: 칸마다 첫 페이지. 여기서 칸별 총 개수를 알게 된다.
  const first = await Promise.all(cells.map((c) => fetchPage(key, code, c, 1)));

  // 2차: 첫 페이지로 다 담기지 않은 칸만 더 받는다.
  // 성긴 칸에 헛된 요청을 보내지 않으려고 두 번에 나눠 부른다.
  const extra: { cell: string; page: number }[] = [];
  first.forEach((r, i) => {
    const pages = Math.min(MAX_PAGES, Math.ceil(r.total / PER_PAGE));
    for (let p = 2; p <= pages; p++) extra.push({ cell: cells[i], page: p });
  });
  // 촘촘한 칸을 먼저 채운다
  extra.sort((a, b) => a.page - b.page);
  const rest = await Promise.all(
    extra.slice(0, EXTRA_BUDGET).map((e) => fetchPage(key, code, e.cell, e.page)),
  );

  // 칸 경계에 걸친 곳이 두 번 올 수 있다
  const seen = new Set<string>();
  const places: Place[] = [];
  for (const { docs } of [...first, ...rest]) {
    for (const d of docs) {
      if (seen.has(d.id)) continue;
      seen.add(d.id);
      // 경계 상자는 사각형이라 여기까지 이웃 도시 것이 딸려 온다.
      // 실제 경계로 한 번 더 거른다.
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
        // rect 검색에는 distance 가 없다. 화면 중심 기준으로 직접 잰다.
        distance: haversine(center.lat, center.lng, Number(d.y), Number(d.x)),
        url: d.place_url,
      });
    }
  }
  /*
   * 화면 안의 총 개수.
   *
   * 칸은 서로 겹치지 않으므로 칸별 총합이 곧 총 개수다. 다만 카카오가
   * 알려주는 총 개수는 사각형 기준이라 시 경계 밖까지 센다. 시 안쪽에
   * 온전히 든 칸은 그대로 맞고, 경계에 걸친 칸은 실제로 받아 본 것 중
   * 몇 할이 시 안이었는지로 환산한다. 경계 부근은 어림수다.
   */
  const total = first.reduce((s, r) => {
    if (r.docs.length === 0) return s;
    const inCity = r.docs.filter((d) => isInsideUiwang(Number(d.y), Number(d.x))).length;
    return s + Math.round(r.total * (inCity / r.docs.length));
  }, 0);
  return { places, total };
}



/**
 * 5분 캐시. 좌표는 소수점 3자리(약 100m)로 뭉뚱그려 키를 만든다.
 * 지도를 조금씩 움직일 때마다 캐시가 빗나가면 캐시가 의미가 없다.
 */
const cache = createTtlCache<{
  places: Place[];
  source: "kakao" | "osm";
  total: number;
}>(5 * 60_000);
const CACHE_TTL_SEC = 300;

export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const wanted = (sp.get("categories") ?? "SC4,HP8,MT1,CS2")
    .split(",")
    .filter((c): c is CategoryKey => c in CATEGORY_MAP);

  /*
   * 표준데이터에서 온 종류는 카카오에 없는 코드다. 그대로 넘기면
   * category_group_code=PARK 같은 요청이 되어 조회 전체가 깨진다.
   * 갈라서 카카오에는 카카오 코드만 보내고, 나머지는 굳혀둔 자료로 채운다.
   */
  const FACILITY: readonly string[] = ["PARK", "PKG", "WC", "SEC"];
  const facilityKinds = wanted.filter((c): c is FacilityKind => FACILITY.includes(c));
  const codes = wanted.filter((c) => !FACILITY.includes(c));
  const lat = Number(sp.get("lat") ?? UIWANG.center.lat);
  const lng = Number(sp.get("lng") ?? UIWANG.center.lng);
  const radius = Math.min(Number(sp.get("radius") ?? UIWANG.defaultRadius), 20000);

  /**
   * 화면 범위. 지도가 준 값이 있으면 그대로 쓰고, 없으면(첫 로딩 등)
   * 중심 반경에서 사각형을 만들어 쓴다.
   */
  const rectParam = sp.get("rect");
  const dLat = radius / 111_000;
  // 위도 37도에서 경도 1도는 약 88km
  const dLng = radius / 88_000;
  const asked =
    rectParam && rectParam.split(",").length === 4
      ? rectParam
      : `${lng - dLng},${lat - dLat},${lng + dLng},${lat + dLat}`;

  // 의왕 밖은 애초에 찾지 않는다
  const rect = clipToCity(asked);

  /*
   * 시설은 화면 범위를 따지지 않고 다 준다. 의왕 전체를 합쳐 243곳뿐이고
   * 이미 소스에 있어 조회 비용이 없다. 화면 밖이라고 감추면 지도를 옮길
   * 때마다 화장실이 나타났다 사라진다.
   */
  const facilities = facilityKinds.length
    ? facilityPlaces(facilityKinds, { lat, lng }, rect)
    : [];

  if (codes.length === 0 || !rect) {
    return ok(
      { places: facilities, source: "kakao" as const, total: facilities.length },
      undefined,
      CACHE_TTL_SEC,
    );
  }

  const cacheKey = `${wanted.slice().sort().join(",")}|${rect}`;
  const cached = cache.get(cacheKey);
  if (cached) return ok(cached, undefined, CACHE_TTL_SEC);

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
      // 카카오 실패 시 아래 OSM 폴백으로 계속 진행
    }
  }

  // 2순위: OpenStreetMap — 무인증이지만 샘플이 아닌 실제 데이터
  try {
    // OSM 도 사각형으로 찾으므로 실제 경계로 걸러야 한다
    const places = [
      ...(await fetchOverpassPlaces(codes, rect, { lat, lng })).filter((p) =>
        isInsideUiwang(p.lat, p.lng),
      ),
      ...facilities,
    ];
    // OSM 은 범위 안의 것을 모두 주므로 걸러낸 수가 곧 총 개수다
    cache.set(cacheKey, { places, source: "osm" as const, total: places.length });
    return ok(
      { places, source: "osm" as const, total: places.length },
      key
        ? "카카오 로컬 호출에 실패해 OpenStreetMap 데이터로 대체했습니다. (© OpenStreetMap contributors)"
        : "KAKAO_REST_KEY 미설정 — OpenStreetMap 실제 데이터로 표시 중입니다. (© OpenStreetMap contributors)",
    );
  } catch (e) {
    console.error("[places:osm]", e);
    return fail(
      { places: [], source: "osm" as const, total: 0 },
      "카카오·OpenStreetMap 모두 조회에 실패했습니다.",
    );
  }
}
