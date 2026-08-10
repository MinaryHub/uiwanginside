import { timedFetch } from "./fetcher";
import { CATEGORY_MAP, type CategoryKey } from "./uiwang";
import type { Place } from "./types";

/**
 * OpenStreetMap Overpass API 기반 장소 조회.
 * 카카오 REST 키가 없을 때 쓰는 무인증 폴백 — 샘플이 아닌 실제 데이터다.
 * 데이터 © OpenStreetMap contributors (ODbL).
 */

/** 공용 미러 — 앞에서부터 시도하고 429/장애 시 다음으로 넘어간다 */
const ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
];

/** 카테고리 → OSM 태그 필터 (node/way 공통으로 적용) */
const OSM_FILTERS: Record<CategoryKey, string[]> = {
  FD6: ['["amenity"~"^(restaurant|fast_food)$"]'],
  CE7: ['["amenity"~"^(cafe|dessert)$"]'],
  SC4: ['["amenity"~"^(school|college|university|kindergarten)$"]'],
  HP8: ['["amenity"~"^(hospital|clinic|doctors)$"]'],
  PM9: ['["amenity"="pharmacy"]'],
  MT1: ['["shop"~"^(supermarket|department_store|mall|wholesale)$"]'],
  CS2: ['["shop"="convenience"]'],
  BK9: ['["amenity"="bank"]'],
  PK6: ['["amenity"="parking"]["access"!="private"]'],
  OL7: ['["amenity"="fuel"]'],
  SW8: ['["railway"="station"]', '["station"="subway"]'],
  PO3: ['["amenity"~"^(townhall|community_centre|police|fire_station|post_office)$"]', '["office"="government"]'],
  CT1: ['["amenity"~"^(theatre|cinema|arts_centre|library)$"]', '["tourism"~"^(museum|gallery)$"]'],
};

interface OverpassElement {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

/** 미터 단위 거리 */
function haversine(aLat: number, aLng: number, bLat: number, bLng: number) {
  const R = 6371000;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((aLat * Math.PI) / 180) *
      Math.cos((bLat * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(s)));
}

/** Overpass bbox 는 (남,서,북,동) 순서다 */
function buildQuery(codes: CategoryKey[], box: string) {
  const parts: string[] = [];
  for (const code of codes) {
    for (const filter of OSM_FILTERS[code] ?? []) {
      parts.push(`node${filter}(${box});`);
      parts.push(`way${filter}(${box});`);
    }
  }
  return `[out:json][timeout:20];(${parts.join("")});out center tags;`;
}

/** 어떤 카테고리에 속하는지 태그로 역판정 (한 요소가 여러 필터에 걸릴 수 있어 우선순위대로) */
function classify(tags: Record<string, string>, codes: CategoryKey[]): CategoryKey | null {
  const amenity = tags.amenity ?? "";
  const shop = tags.shop ?? "";
  for (const code of codes) {
    switch (code) {
      case "FD6":
        if (/^(restaurant|fast_food)$/.test(amenity)) return code;
        break;
      case "CE7":
        if (/^(cafe|dessert)$/.test(amenity)) return code;
        break;
      case "SC4":
        if (/^(school|college|university|kindergarten)$/.test(amenity)) return code;
        break;
      case "HP8":
        if (/^(hospital|clinic|doctors)$/.test(amenity)) return code;
        break;
      case "PM9":
        if (amenity === "pharmacy") return code;
        break;
      case "MT1":
        if (/^(supermarket|department_store|mall|wholesale)$/.test(shop)) return code;
        break;
      case "CS2":
        if (shop === "convenience") return code;
        break;
      case "BK9":
        if (amenity === "bank") return code;
        break;
      case "PK6":
        if (amenity === "parking") return code;
        break;
      case "OL7":
        if (amenity === "fuel") return code;
        break;
      case "SW8":
        if (tags.railway === "station" || tags.station === "subway") return code;
        break;
      case "PO3":
        if (/^(townhall|community_centre|police|fire_station|post_office)$/.test(amenity))
          return code;
        if (tags.office === "government") return code;
        break;
      case "CT1":
        if (/^(theatre|cinema|arts_centre|library)$/.test(amenity)) return code;
        if (/^(museum|gallery)$/.test(tags.tourism ?? "")) return code;
        break;
    }
  }
  return null;
}

function addressOf(t: Record<string, string>) {
  const parts = [
    t["addr:province"] ?? t["addr:state"],
    t["addr:city"],
    t["addr:district"],
    t["addr:street"],
    t["addr:housenumber"],
  ].filter(Boolean);
  return parts.join(" ");
}

/** 10분 메모리 캐시 — Overpass 는 공용 무료 서버라 과호출을 피한다 */
const cache = new Map<string, { at: number; places: Place[] }>();
const TTL = 10 * 60_000;

/**
 * Overpass 공통 호출 — 미러를 순차 시도.
 * 미러 3곳 × 타임아웃이 그대로 응답 지연이 되므로 개별 타임아웃을 짧게 잡는다.
 */
async function runOverpass(query: string, timeoutMs = 10_000): Promise<OverpassElement[]> {
  const body = `data=${encodeURIComponent(query)}`;
  let lastErr: unknown = null;

  for (const endpoint of ENDPOINTS) {
    try {
      const res = await timedFetch(
        endpoint,
        {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body,
        },
        timeoutMs,
      );
      if (!res.ok) throw new Error(`overpass ${res.status}`);
      const json = (await res.json()) as { elements: OverpassElement[] };
      return json.elements ?? [];
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("Overpass 호출 실패");
}

const stopCache = new Map<string, { at: number; stops: OsmBusStop[] }>();

export interface OsmBusStop {
  id: string;
  name: string;
  /** OSM ref 태그 = 정류소 번호(ARS). GBIS stationId 와는 다르다. */
  ref: string;
  lat: number;
  lng: number;
  distance: number;
}

/**
 * OSM 버스정류장. GBIS 정류소 조회 서비스가 아직 승인되지 않았을 때
 * 지도에 실제 정류소 위치라도 표시하기 위한 폴백.
 * GBIS stationId 가 없으므로 도착 예정 시간은 붙일 수 없다.
 */
export async function fetchOverpassBusStops(
  lat: number,
  lng: number,
  radius: number,
  limit: number,
): Promise<OsmBusStop[]> {
  const key = `stops|${lat.toFixed(3)}|${lng.toFixed(3)}|${radius}`;
  const hit = stopCache.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.stops.slice(0, limit);

  const query =
    `[out:json][timeout:20];(` +
    `node["highway"="bus_stop"](around:${radius},${lat},${lng});` +
    `node["public_transport"="platform"]["bus"="yes"](around:${radius},${lat},${lng});` +
    // out body: 노드의 lat/lon 을 함께 반환한다 (out tags 는 좌표가 빠진다)
    `);out body;`;

  const elements = await runOverpass(query);
  const seen = new Set<string>();
  const stops: OsmBusStop[] = [];

  for (const el of elements) {
    const tags = el.tags ?? {};
    const name = tags["name:ko"] ?? tags.name;
    if (!name || el.lat == null || el.lon == null) continue;
    const dedupe = `${name}|${el.lat.toFixed(4)}|${el.lon.toFixed(4)}`;
    if (seen.has(dedupe)) continue;
    seen.add(dedupe);
    stops.push({
      id: `osm-${el.id}`,
      name,
      ref: tags.ref ?? "",
      lat: el.lat,
      lng: el.lon,
      distance: haversine(lat, lng, el.lat, el.lon),
    });
  }

  stops.sort((a, b) => a.distance - b.distance);
  stopCache.set(key, { at: Date.now(), stops });
  return stops.slice(0, limit);
}

export async function fetchOverpassPlaces(
  codes: CategoryKey[],
  rect: string,
  center: { lat: number; lng: number },
): Promise<Place[]> {
  // rect 는 카카오 형식(minLng,minLat,maxLng,maxLat) — Overpass 순서로 바꾼다
  const [minLng, minLat, maxLng, maxLat] = rect.split(",").map(Number);
  const box = `${minLat},${minLng},${maxLat},${maxLng}`;
  const key = `${codes.slice().sort().join(",")}|${rect}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.places;

  const body = `data=${encodeURIComponent(buildQuery(codes, box))}`;
  let elements: OverpassElement[] | null = null;
  let lastErr: unknown = null;

  for (const endpoint of ENDPOINTS) {
    try {
      const res = await timedFetch(
        endpoint,
        {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body,
        },
        20_000,
      );
      if (!res.ok) throw new Error(`overpass ${res.status}`);
      const json = (await res.json()) as { elements: OverpassElement[] };
      elements = json.elements ?? [];
      break;
    } catch (e) {
      lastErr = e;
    }
  }

  if (elements === null) {
    throw lastErr instanceof Error ? lastErr : new Error("Overpass 호출 실패");
  }

  const places: Place[] = [];
  const seen = new Set<string>();

  for (const el of elements) {
    const tags = el.tags ?? {};
    const name = tags["name:ko"] ?? tags.name;
    if (!name) continue; // 이름 없는 요소는 목록에서 쓸모가 없다

    const pLat = el.lat ?? el.center?.lat;
    const pLng = el.lon ?? el.center?.lon;
    if (pLat == null || pLng == null) continue;

    const code = classify(tags, codes);
    if (!code) continue;

    // node/way 중복 (같은 시설이 두 형태로 존재) 제거
    const dedupe = `${code}|${name}|${pLat.toFixed(4)}|${pLng.toFixed(4)}`;
    if (seen.has(dedupe)) continue;
    seen.add(dedupe);

    places.push({
      id: `osm-${el.type}-${el.id}`,
      name,
      category: code,
      categoryName: CATEGORY_MAP[code].label,
      phone: tags.phone ?? tags["contact:phone"] ?? "",
      address: addressOf(tags),
      roadAddress: addressOf(tags),
      lat: pLat,
      lng: pLng,
      distance: haversine(center.lat, center.lng, pLat, pLng),
      url: tags.website ?? tags["contact:website"] ?? "",
    });
  }

  places.sort((a, b) => (a.distance ?? 0) - (b.distance ?? 0));
  cache.set(key, { at: Date.now(), places });
  return places;
}
