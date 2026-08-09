import { ok, fail, nowISO } from "@/lib/fetcher";
import { fetchGbisPositions } from "@/lib/gbisLocation";
import { fetchBusPositions } from "@/lib/tago";
import type { BusPositionsPayload } from "@/lib/types";

export const dynamic = "force-dynamic";

/** GBIS·TAGO 모두 10~20초 주기로 갱신된다 */
const CACHE_SEC = 15;

const EMPTY: BusPositionsPayload = {
  routeId: "",
  routeName: "",
  positions: [],
  cityName: "",
  source: "gbis",
  unresolved: 0,
  updatedAt: "",
};

export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const routeId = (sp.get("routeId") ?? "").replace(/[^0-9]/g, "").slice(0, 20);
  const routeName = (sp.get("routeName") ?? "").slice(0, 40);

  if (!routeId) return fail(EMPTY, "노선 정보가 없습니다.");

  const dataKey = process.env.GBIS_SERVICE_KEY;
  const ggKey = process.env.GG_DATA_KEY;
  const base = { ...EMPTY, routeId, routeName };

  if (!dataKey) return fail(base, "버스 인증키가 설정되지 않았습니다.");

  /**
   * GBIS 를 먼저 쓴다. 혼잡도·저상·좌석을 함께 주고, TAGO 에 없는
   * 서울 소속 노선(441번 등)까지 다룬다.
   * 좌표를 하나도 못 구하면 GPS 를 직접 주는 TAGO 로 넘어간다.
   */
  if (ggKey) {
    try {
      const r = await fetchGbisPositions(dataKey, ggKey, routeId);
      if (r.positions.length > 0) {
        return ok(
          {
            routeId,
            routeName,
            positions: r.positions,
            cityName: "",
            source: "gbis" as const,
            unresolved: r.unresolved,
            updatedAt: nowISO(),
          } satisfies BusPositionsPayload,
          r.unresolved > 0
            ? `${r.unresolved}대는 수도권 밖 구간이라 위치를 표시하지 않았습니다.`
            : undefined,
          CACHE_SEC,
        );
      }
    } catch (e) {
      console.error("[bus-positions:gbis]", e);
    }
  }

  try {
    const result = await fetchBusPositions(dataKey, routeId);
    if (!result) {
      return fail(base, "지금 이 노선의 위치 정보를 찾지 못했습니다.");
    }
    return ok(
      {
        routeId,
        routeName,
        positions: result.positions,
        cityName: result.cityName,
        source: "tago" as const,
        unresolved: 0,
        updatedAt: nowISO(),
      } satisfies BusPositionsPayload,
      undefined,
      CACHE_SEC,
    );
  } catch (e) {
    console.error("[bus-positions:tago]", e);
    return fail(base, `버스 위치 조회 실패: ${e instanceof Error ? e.message : e}`);
  }
}
