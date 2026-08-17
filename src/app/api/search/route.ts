import { timedFetch, ok, fail, createTtlCache } from "@/lib/fetcher";
import { UIWANG_BBOX } from "@/lib/uiwang-boundary";
import { isInsideUiwang } from "@/lib/geo";
import { haversine } from "@/lib/busStations";
import { UIWANG, CATEGORY_MAP, type CategoryKey } from "@/lib/uiwang";
import type { Place } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * 이름으로 찾기.
 *
 * 지금까지는 목록에 이미 받아온 것 안에서만 걸렀다. 화면 밖에 있는
 * "의왕도서관" 을 치면 아무것도 나오지 않았다. 카카오 키워드 검색을
 * 쓰되, 사각형으로 요청하면 이웃 도시가 섞이므로(부곡동 우체국 → 수원
 * 율전동우체국·군포당동우체국) 실제 경계로 다시 거른다.
 */
const CACHE_SEC = 300;
const MAX = 12;

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
  place_url: string;
}

const cache = createTtlCache<{ places: Place[] }>(CACHE_SEC * 1000);

export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const q = (sp.get("q") ?? "").trim().slice(0, 40);
  const lat = Number(sp.get("lat") ?? UIWANG.center.lat);
  const lng = Number(sp.get("lng") ?? UIWANG.center.lng);

  if (q.length < 2) return ok({ places: [] as Place[] }, undefined, CACHE_SEC);

  const cached = cache.get(q);
  if (cached) return ok(cached, undefined, CACHE_SEC);

  const key = process.env.KAKAO_REST_KEY;
  if (!key) return fail({ places: [] as Place[] }, "카카오 키가 설정되지 않았습니다.");

  const { minLng, minLat, maxLng, maxLat } = UIWANG_BBOX;
  const url =
    `https://dapi.kakao.com/v2/local/search/keyword.json` +
    `?query=${encodeURIComponent(q)}` +
    `&rect=${minLng},${minLat},${maxLng},${maxLat}&size=15`;

  try {
    const res = await timedFetch(url, { headers: { Authorization: `KakaoAK ${key}` } }, 8000);
    if (!res.ok) throw new Error(`kakao ${res.status}: ${(await res.text()).slice(0, 120)}`);

    const json = (await res.json()) as { documents: KakaoDoc[] };
    const places: Place[] = [];
    for (const d of json.documents) {
      const y = Number(d.y);
      const x = Number(d.x);
      // 사각형으로 받았으니 실제 경계로 거른다
      if (!isInsideUiwang(y, x)) continue;
      places.push({
        id: d.id,
        name: d.place_name,
        /*
         * 키워드 검색은 우리가 쓰지 않는 코드(AT4 관광명소 등)나 빈 값도
         * 준다. 백운호수·왕송호수가 그렇다. 모르는 코드는 기본 종류로
         * 돌린다 — 그러지 않으면 마커도 상세 카드도 그려지지 않는다.
         */
        category: (d.category_group_code in CATEGORY_MAP
          ? d.category_group_code
          : "ETC") as CategoryKey,
        categoryName: d.category_name,
        phone: d.phone,
        address: d.address_name,
        roadAddress: d.road_address_name,
        lat: y,
        lng: x,
        distance: haversine(lat, lng, y, x),
        url: d.place_url,
      });
      if (places.length >= MAX) break;
    }

    const payload = { places };
    cache.set(q, payload);
    return ok(payload, undefined, CACHE_SEC);
  } catch (e) {
    console.error("[search]", e);
    return fail({ places: [] as Place[] }, `검색 실패: ${e instanceof Error ? e.message : e}`);
  }
}
