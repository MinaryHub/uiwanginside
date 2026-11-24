import { timedFetch, ok, fail, normalizeServiceKey, asArray } from "@/lib/fetcher";
import { fetchWithSharedCache } from "@/lib/sharedCache";
import { isInsideUiwang, flatMetres } from "@/lib/geo";

export const dynamic = "force-dynamic";

const GBIS = "https://apis.data.go.kr/6410000/busrouteservice/v2/getBusRouteLineListv2";
const CACHE_SEC = 24 * 60 * 60;
const MARGIN_M = 800;
const THIN_M = 10;

interface Pt {
  lineSeq: number;
  x: number;
  y: number;
}

/** 노선 조합이 아니라 개별 routeId 단위로 L1/L2 공용 캐시(24시간)한다 */
async function fetchPath(key: string, routeId: string): Promise<[number, number][]> {
  const cached = await fetchWithSharedCache<[number, number][]>({
    key: `bus-route:${routeId}`,
    ttlMs: CACHE_SEC * 1000,
    staleMaxMs: 7 * 24 * 3600_000,
    failCooldownMs: 120_000,
    fetcher: async () => {
      const res = await timedFetch(
        `${GBIS}?serviceKey=${normalizeServiceKey(key)}&routeId=${routeId}&format=json`,
        {},
        10_000,
      );
      if (!res.ok) throw new Error(`gbis ${res.status}`);
      const json = await res.json();
      const code = json?.response?.msgHeader?.resultCode;
      if (code !== 0 && code !== "0") {
        throw new Error(`${code}: ${json?.response?.msgHeader?.resultMessage ?? ""}`);
      }
      const raw = asArray<Pt>(json?.response?.msgBody?.busRouteLineList);

      const ordered = raw
        .slice()
        .sort((a, b) => a.lineSeq - b.lineSeq)
        .map((p) => [Number(p.y), Number(p.x)] as [number, number])
        .filter(([lat, lng]) => Number.isFinite(lat) && Number.isFinite(lng));

      const keepIdx = new Set<number>();
      ordered.forEach((p, i) => {
        if (isInsideUiwang(p[0], p[1])) keepIdx.add(i);
      });
      const near = new Set(keepIdx);
      for (const i of keepIdx) {
        for (let j = i - 1; j >= 0; j--) {
          if (flatMetres(ordered[i][0], ordered[i][1], ordered[j][0], ordered[j][1]) > MARGIN_M) break;
          near.add(j);
        }
        for (let j = i + 1; j < ordered.length; j++) {
          if (flatMetres(ordered[i][0], ordered[i][1], ordered[j][0], ordered[j][1]) > MARGIN_M) break;
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
        const prev = out[out.length - 1];
        if (!prev || flatMetres(prev[0], prev[1], p[0], p[1]) > THIN_M) out.push(p);
      }
      return { value: out };
    },
  });
  return cached.value;
}

export async function GET(req: Request) {
  const ids = [
    ...new Set(
      (new URL(req.url).searchParams.get("routeIds") ?? "")
        .split(",")
        .map((s) => s.replace(/[^0-9]/g, ""))
        .filter(Boolean),
    ),
  ].slice(0, 8);

  if (ids.length === 0) return ok({ paths: {} }, undefined, CACHE_SEC);

  const key = process.env.GBIS_SERVICE_KEY;
  if (!key) return fail({ paths: {} }, "버스 인증키가 설정되지 않았습니다.");

  const settled = await Promise.allSettled(
    ids.map(async (id) => [id, await fetchPath(key, id)] as const),
  );
  const paths: Record<string, [number, number][]> = {};
  for (const s of settled) {
    if (s.status === "fulfilled" && s.value[1].length > 1) paths[s.value[0]] = s.value[1];
  }
  return ok({ paths }, undefined, CACHE_SEC);
}
