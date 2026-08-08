import { timedFetch, ok, fail } from "@/lib/fetcher";
import { fetchOverpassPlaces } from "@/lib/overpass";
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

/** 카카오 로컬은 페이지당 15건, 최대 3페이지(45건)까지 수집 */
async function searchCategory(
  key: string,
  code: CategoryKey,
  lat: number,
  lng: number,
  radius: number,
): Promise<Place[]> {
  const out: Place[] = [];
  for (let page = 1; page <= 3; page++) {
    const url =
      `https://dapi.kakao.com/v2/local/search/category.json` +
      `?category_group_code=${code}&x=${lng}&y=${lat}&radius=${radius}` +
      `&size=15&page=${page}&sort=distance`;
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
        distance: d.distance ? Number(d.distance) : null,
        url: d.place_url,
      });
    }
    if (json.meta.is_end) break;
  }
  return out;
}

/** 키가 없을 때 UI 검증용 최소 샘플 */
function samplePlaces(codes: CategoryKey[]): Place[] {
  const seeds: Record<string, [string, number, number][]> = {
    SC4: [
      ["의왕고등학교", 37.3467, 126.9714],
      ["부곡중학교", 37.3201, 126.9591],
      ["백운초등학교", 37.3758, 126.9702],
    ],
    HP8: [
      ["의왕시립병원", 37.3441, 126.9671],
      ["내손연합의원", 37.3749, 126.9693],
    ],
    PM9: [["고천약국", 37.3438, 126.9709]],
    MT1: [
      ["롯데마트 의왕점", 37.3452, 126.9723],
      ["이마트 트레이더스 의왕", 37.3395, 126.9648],
    ],
    CS2: [
      ["GS25 고천점", 37.3444, 126.9695],
      ["CU 내손점", 37.3752, 126.9711],
      ["세븐일레븐 부곡점", 37.3192, 126.9583],
    ],
    BK9: [["농협은행 의왕지점", 37.3450, 126.9688]],
    PK6: [["의왕시청 공영주차장", 37.3446, 126.9679]],
    OL7: [["SK주유소 고천점", 37.3421, 126.9731]],
    SW8: [
      ["의왕역", 37.3447, 126.9686],
      ["인덕원역", 37.4013, 126.9767],
    ],
    PO3: [["의왕시청", 37.3448, 126.9683]],
    CT1: [["철도박물관", 37.3268, 126.9412]],
  };
  const out: Place[] = [];
  for (const code of codes) {
    for (const [name, lat, lng] of seeds[code] ?? []) {
      out.push({
        id: `sample-${code}-${name}`,
        name,
        category: code,
        categoryName: CATEGORY_MAP[code].label,
        phone: "",
        address: "경기 의왕시",
        roadAddress: "경기 의왕시",
        lat,
        lng,
        distance: null,
        url: "",
      });
    }
  }
  return out;
}

export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const codes = (sp.get("categories") ?? "SC4,HP8,MT1,CS2")
    .split(",")
    .filter((c): c is CategoryKey => c in CATEGORY_MAP);
  const lat = Number(sp.get("lat") ?? UIWANG.center.lat);
  const lng = Number(sp.get("lng") ?? UIWANG.center.lng);
  const radius = Math.min(Number(sp.get("radius") ?? UIWANG.defaultRadius), 20000);

  const key = process.env.KAKAO_REST_KEY;

  // 1순위: 카카오 로컬 (전화번호·상세페이지까지 제공)
  if (key) {
    try {
      const results = await Promise.all(
        codes.map((c) => searchCategory(key, c, lat, lng, radius)),
      );
      const places = results.flat();
      places.sort((a, b) => (a.distance ?? 0) - (b.distance ?? 0));
      return ok({ places, source: "kakao" as const });
    } catch (e) {
      console.error("[places:kakao]", e);
      // 카카오 실패 시 아래 OSM 폴백으로 계속 진행
    }
  }

  // 2순위: OpenStreetMap — 무인증이지만 샘플이 아닌 실제 데이터
  try {
    const places = await fetchOverpassPlaces(codes, lat, lng, radius);
    return ok(
      { places, source: "osm" as const },
      key
        ? "카카오 로컬 호출에 실패해 OpenStreetMap 데이터로 대체했습니다. (© OpenStreetMap contributors)"
        : "KAKAO_REST_KEY 미설정 — OpenStreetMap 실제 데이터로 표시 중입니다. (© OpenStreetMap contributors)",
    );
  } catch (e) {
    console.error("[places:osm]", e);
    return fail(
      { places: samplePlaces(codes), source: "sample" as const },
      "카카오·OpenStreetMap 모두 조회에 실패했습니다. 샘플 데이터를 표시합니다.",
    );
  }
}
