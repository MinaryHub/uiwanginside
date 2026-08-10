import { timedFetch, ok, fail, createTtlCache } from "@/lib/fetcher";
import { fetchOverpassPlaces } from "@/lib/overpass";
import { haversine } from "@/lib/busStations";
import { UIWANG, CATEGORY_MAP, type CategoryKey } from "@/lib/uiwang";
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
 * 카카오 로컬은 페이지당 15건, 최대 3페이지(45건)까지 수집한다.
 *
 * 중심 반경(radius) 이 아니라 화면 범위(rect) 로 찾는다. 반경으로 찾으면
 * 결과가 중심 주변에 몰려 지도 가장자리는 비어 보인다 — "일부만 표시되는"
 * 것처럼 느껴지는 원인이었다.
 */
async function searchCategory(
  key: string,
  code: CategoryKey,
  rect: string,
  center: { lat: number; lng: number },
): Promise<Place[]> {
  const out: Place[] = [];
  for (let page = 1; page <= 3; page++) {
    const url =
      `https://dapi.kakao.com/v2/local/search/category.json` +
      /*
       * sort=accuracy 로 받는다. 거리순으로 받으면 화면에 545곳이 있어도
       * 중심에서 가까운 45곳만 와서 가장자리가 텅 빈다.
       * 목록 정렬은 아래에서 직접 계산한 거리로 한다.
       */
      `?category_group_code=${code}&rect=${rect}` +
      `&size=15&page=${page}&sort=accuracy`;
    const res = await timedFetch(url, {
      headers: { Authorization: `KakaoAK ${key}` },
    });
    // 오류를 삼키면 "결과 0건" 으로 둔갑해 OSM 폴백이 동작하지 않는다.
    if (!res.ok) {
      throw new Error(`kakao ${res.status}: ${(await res.text()).slice(0, 200)}`);
    }
    const json = (await res.json()) as {
      documents: KakaoDoc[];
      meta: { is_end: boolean };
    };
    for (const d of json.documents) {
      out.push({
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
    if (json.meta.is_end) break;
  }
  return out;
}



/**
 * 5분 캐시. 좌표는 소수점 3자리(약 100m)로 뭉뚱그려 키를 만든다.
 * 지도를 조금씩 움직일 때마다 캐시가 빗나가면 캐시가 의미가 없다.
 */
const cache = createTtlCache<{ places: Place[]; source: "kakao" | "osm" }>(5 * 60_000);
const CACHE_TTL_SEC = 300;

export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const codes = (sp.get("categories") ?? "SC4,HP8,MT1,CS2")
    .split(",")
    .filter((c): c is CategoryKey => c in CATEGORY_MAP);
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
  const rect =
    rectParam && rectParam.split(",").length === 4
      ? rectParam
      : `${lng - dLng},${lat - dLat},${lng + dLng},${lat + dLat}`;

  if (codes.length === 0) {
    return ok({ places: [], source: "kakao" as const }, undefined, CACHE_TTL_SEC);
  }

  const cacheKey = `${codes.slice().sort().join(",")}|${rect}`;
  const cached = cache.get(cacheKey);
  if (cached) return ok(cached, undefined, CACHE_TTL_SEC);

  const key = process.env.KAKAO_REST_KEY;

  // 1순위: 카카오 로컬 (전화번호·상세페이지까지 제공)
  if (key) {
    try {
      const results = await Promise.all(
        codes.map((c) => searchCategory(key, c, rect, { lat, lng })),
      );
      const places = results.flat();
      places.sort((a, b) => (a.distance ?? 0) - (b.distance ?? 0));
      const payload = { places, source: "kakao" as const };
      cache.set(cacheKey, payload);
      return ok(payload, undefined, CACHE_TTL_SEC);
    } catch (e) {
      console.error("[places:kakao]", e);
      // 카카오 실패 시 아래 OSM 폴백으로 계속 진행
    }
  }

  // 2순위: OpenStreetMap — 무인증이지만 샘플이 아닌 실제 데이터
  try {
    const places = await fetchOverpassPlaces(codes, rect, { lat, lng });
    cache.set(cacheKey, { places, source: "osm" as const });
    return ok(
      { places, source: "osm" as const },
      key
        ? "카카오 로컬 호출에 실패해 OpenStreetMap 데이터로 대체했습니다. (© OpenStreetMap contributors)"
        : "KAKAO_REST_KEY 미설정 — OpenStreetMap 실제 데이터로 표시 중입니다. (© OpenStreetMap contributors)",
    );
  } catch (e) {
    console.error("[places:osm]", e);
    return fail(
      { places: [], source: "osm" as const },
      "카카오·OpenStreetMap 모두 조회에 실패했습니다.",
    );
  }
}
