import { timedFetch, ok, fail, createTtlCache } from "@/lib/fetcher";
import { isInsideUiwang } from "@/lib/geo";

export const dynamic = "force-dynamic";

/**
 * 노선의 실제 주행 경로.
 *
 * 버스 위치는 16초에 한 번만 온다. 그 사이를 직선으로 이으면 코너와
 * 곡선에서 도로를 가로질러 간다. 실제 경로 위를 따라가게 하려고 받는다.
 *
 * 경로는 바뀌지 않으므로 오래 캐시한다. 브라우저·CDN 까지 하루를 준다.
 */
const GBIS = "https://apis.data.go.kr/6410000/busrouteservice/v2/getBusRouteLineListv2";
const CACHE_SEC = 24 * 60 * 60;

/**
 * 의왕 밖 구간은 버릴 수 있지만, 경계에 걸친 버스를 붙일 자리가 있어야
 * 하므로 조금 넉넉히 남긴다.
 */
const MARGIN_M = 800;

/** 이보다 촘촘한 점은 화면에서 구분되지 않는다 */
const THIN_M = 10;

interface Pt {
  lineSeq: number;
  x: number;
  y: number;
}

const cache = createTtlCache<Record<string, [number, number][]>>(CACHE_SEC * 1000);

function metres(a: [number, number], b: [number, number]) {
  return Math.hypot((a[0] - b[0]) * 111_000, (a[1] - b[1]) * 88_000);
}

async function fetchPath(key: string, routeId: string): Promise<[number, number][]> {
  const res = await timedFetch(
    `${GBIS}?serviceKey=${key}&routeId=${routeId}&format=json`,
    {},
    10_000,
  );
  if (!res.ok) throw new Error(`gbis ${res.status}`);
  const json = await res.json();
  const code = json?.response?.msgHeader?.resultCode;
  if (code !== 0 && code !== "0") {
    throw new Error(`${code}: ${json?.response?.msgHeader?.resultMessage ?? ""}`);
  }
  const raw: Pt[] = json?.response?.msgBody?.busRouteLineList ?? [];

  // lineSeq 가 주행 순서다. 순서가 어긋나면 경로가 뒤엉킨다.
  const ordered = raw
    .slice()
    .sort((a, b) => a.lineSeq - b.lineSeq)
    .map((p) => [Number(p.y), Number(p.x)] as [number, number])
    .filter(([lat, lng]) => Number.isFinite(lat) && Number.isFinite(lng));

  /*
   * 의왕 안과 그 언저리만 남긴다. 노선 하나가 1,200점인데 대부분은
   * 안양·수원 구간이라 우리가 쓸 일이 없다.
   *
   * 경계 밖이라도 안쪽 점과 가까우면 남긴다 — 잘라낸 자리에서 경로가
   * 끊기면 그 구간을 지나는 버스를 붙일 곳이 없다.
   */
  const keepIdx = new Set<number>();
  ordered.forEach((p, i) => {
    if (isInsideUiwang(p[0], p[1])) keepIdx.add(i);
  });
  const near = new Set(keepIdx);
  for (const i of keepIdx) {
    for (let j = i - 1; j >= 0; j--) {
      if (metres(ordered[i], ordered[j]) > MARGIN_M) break;
      near.add(j);
    }
    for (let j = i + 1; j < ordered.length; j++) {
      if (metres(ordered[i], ordered[j]) > MARGIN_M) break;
      near.add(j);
    }
  }

  const out: [number, number][] = [];
  for (let i = 0; i < ordered.length; i++) {
    if (!near.has(i)) continue;
    const p: [number, number] = [
      Number(ordered[i][0].toFixed(6)),
      Number(ordered[i][1].toFixed(6)),
    ];
    // 촘촘한 점은 솎되, 끊긴 자리(이전 점과 멀리 떨어진 곳)는 반드시 남긴다
    const prev = out[out.length - 1];
    if (!prev || metres(prev, p) > THIN_M) out.push(p);
  }
  return out;
}

export async function GET(req: Request) {
  const ids = (new URL(req.url).searchParams.get("routeIds") ?? "")
    .split(",")
    .map((s) => s.replace(/[^0-9]/g, ""))
    .filter(Boolean)
    .slice(0, 8);

  if (ids.length === 0) return ok({ paths: {} }, undefined, CACHE_SEC);

  const key = process.env.GBIS_SERVICE_KEY;
  if (!key) return fail({ paths: {} }, "버스 인증키가 설정되지 않았습니다.");

  const cacheKey = ids.slice().sort().join(",");
  const hit = cache.get(cacheKey);
  if (hit) return ok({ paths: hit }, undefined, CACHE_SEC);

  // 한 노선이 실패해도 나머지는 준다 — 경로 없는 노선은 직선으로 움직인다
  const settled = await Promise.allSettled(
    ids.map(async (id) => [id, await fetchPath(key, id)] as const),
  );
  const paths: Record<string, [number, number][]> = {};
  for (const s of settled) {
    if (s.status === "fulfilled" && s.value[1].length > 1) paths[s.value[0]] = s.value[1];
  }
  if (Object.keys(paths).length > 0) cache.set(cacheKey, paths);
  return ok({ paths }, undefined, CACHE_SEC);
}
