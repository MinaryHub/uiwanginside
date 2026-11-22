import { timedFetch, ok, fail, createTtlCache } from "@/lib/fetcher";
import { UIWANG_BBOX } from "@/lib/uiwang-boundary";
import { isInsideUiwang, haversine } from "@/lib/geo";
import { UIWANG, CATEGORY_MAP, type CategoryKey } from "@/lib/uiwang";
import type { Place } from "@/lib/types";

export const dynamic = "force-dynamic";

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

const cache = createTtlCache<Place[]>(CACHE_SEC * 1000);

function withDistance(places: Place[], lat: number, lng: number): Place[] {
  return places.map((p) => ({
    ...p,
    distance: haversine(lat, lng, p.lat, p.lng),
  }));
}

export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const q = (sp.get("q") ?? "").trim().slice(0, 40);
  const rawLat = Number(sp.get("lat") ?? UIWANG.center.lat);
  const rawLng = Number(sp.get("lng") ?? UIWANG.center.lng);
  const lat = Number.isFinite(rawLat) && rawLat >= 33 && rawLat <= 39 ? rawLat : UIWANG.center.lat;
  const lng = Number.isFinite(rawLng) && rawLng >= 124 && rawLng <= 132 ? rawLng : UIWANG.center.lng;

  if (q.length < 2) return ok({ places: [] as Place[] }, undefined, CACHE_SEC);

  const cached = cache.get(q);
  if (cached) return ok({ places: withDistance(cached, lat, lng) }, undefined, CACHE_SEC);

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

    const json = (await res.json()) as { documents?: KakaoDoc[] };
    const places: Place[] = [];
    for (const d of json.documents ?? []) {
      const y = Number(d.y);
      const x = Number(d.x);
      if (!isInsideUiwang(y, x)) continue;
      places.push({
        id: d.id,
        name: d.place_name,
        category: (d.category_group_code in CATEGORY_MAP
          ? d.category_group_code
          : "ETC") as CategoryKey,
        categoryName: d.category_name,
        phone: d.phone,
        address: d.address_name,
        roadAddress: d.road_address_name,
        lat: y,
        lng: x,
        distance: null,
        url: d.place_url,
      });
      if (places.length >= MAX) break;
    }

    cache.set(q, places);
    return ok({ places: withDistance(places, lat, lng) }, undefined, CACHE_SEC);
  } catch (e) {
    console.error("[search]", e);
    return fail({ places: [] as Place[] }, `검색 실패: ${e instanceof Error ? e.message : e}`);
  }
}
