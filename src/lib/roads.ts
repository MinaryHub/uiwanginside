import { timedFetch, createTtlCache } from "./fetcher";
import type { RoadWay } from "./types";

/**
 * 의왕시 주요도로의 형상.
 *
 * 두 곳에서 쓴다.
 *   - /api/roads : 지도에 선을 그리려면 형상이 필요하다
 *   - /api/traffic : ITS 는 사각형 범위로 답하므로 수원·군포 이면도로가
 *                    섞여 온다. 여기 있는 이름만 남겨 걸러낸다.
 *
 * 길은 하루 사이에 바뀌지 않으므로 하루를 캐시한다.
 */
const OVERPASS = "https://overpass-api.de/api/interpreter";
export const ROADS_TTL_SEC = 24 * 60 * 60;

/** 의왕시 OSM relation */
const UIWANG_REL = 2409184;

const QUERY = `[out:json][timeout:120];
rel(${UIWANG_REL});map_to_area->.a;
way(area.a)["highway"~"^(motorway|trunk|primary|secondary|tertiary|motorway_link|trunk_link|primary_link)$"]["name"];
out geom;`;

interface OverpassWay {
  tags?: { name?: string; highway?: string };
  geometry?: { lat: number; lon: number }[];
}

/**
 * 15m 보다 촘촘한 점은 화면에서 구분되지 않는다.
 * 그릴 선이 수백 개라 점 하나가 수백 번 곱해진다.
 */
function thin(points: [number, number][]): [number, number][] {
  if (points.length < 3) return points;
  const out: [number, number][] = [points[0]];
  for (const p of points.slice(1, -1)) {
    const q = out[out.length - 1];
    const dy = (p[0] - q[0]) * 111_000;
    const dx = (p[1] - q[1]) * 88_000;
    if (Math.hypot(dx, dy) > 15) out.push(p);
  }
  out.push(points[points.length - 1]);
  return out;
}

const cache = createTtlCache<RoadWay[]>(ROADS_TTL_SEC * 1000);

export async function fetchUiwangRoads(): Promise<RoadWay[]> {
  const cached = cache.get("roads");
  if (cached) return cached;

  const res = await timedFetch(
    OVERPASS,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        // Overpass 는 기본 UA 를 막는다
        "User-Agent": "uiwang-inside/1.0 (+https://uiwanginside-gilt.vercel.app)",
      },
      body: `data=${encodeURIComponent(QUERY)}`,
    },
    60_000,
  );
  if (!res.ok) throw new Error(`overpass ${res.status}`);

  const json = (await res.json()) as { elements?: OverpassWay[] };
  const ways: RoadWay[] = [];
  for (const el of json.elements ?? []) {
    const name = el.tags?.name?.trim();
    const geom = el.geometry;
    if (!name || !geom || geom.length < 2) continue;
    ways.push({
      name,
      // 도시고속·고속도로는 소통상태 기준이 다르다
      expressway: /^(motorway|trunk)/.test(el.tags?.highway ?? ""),
      path: thin(
        geom.map(
          (p) => [Number(p.lat.toFixed(5)), Number(p.lon.toFixed(5))] as [number, number],
        ),
      ),
    });
  }
  if (ways.length > 0) cache.set("roads", ways);
  return ways;
}

/** 의왕에 실제로 있는 도로명. 소통정보에서 이웃 도시를 걸러내는 데 쓴다. */
export async function uiwangRoadNames(): Promise<Set<string>> {
  try {
    return new Set((await fetchUiwangRoads()).map((r) => r.name));
  } catch {
    // 형상을 못 받으면 거르지 않는다. 거르다 다 지우는 것보다 낫다.
    return new Set();
  }
}
