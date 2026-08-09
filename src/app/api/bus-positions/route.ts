import { ok, fail, nowISO } from "@/lib/fetcher";
import { fetchBusPositions } from "@/lib/tago";
import type { BusPositionsPayload } from "@/lib/types";

export const dynamic = "force-dynamic";

/** TAGO 갱신 주기가 10~20초라 그보다 짧게 캐시할 이유가 없다 */
const CACHE_SEC = 15;

const EMPTY: BusPositionsPayload = {
  routeId: "",
  routeName: "",
  positions: [],
  cityName: "",
  updatedAt: "",
};

export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const routeId = (sp.get("routeId") ?? "").replace(/[^0-9]/g, "").slice(0, 20);
  const routeName = (sp.get("routeName") ?? "").slice(0, 40);

  if (!routeId) return fail(EMPTY, "노선 정보가 없습니다.");

  const key = process.env.TAGO_SERVICE_KEY ?? process.env.GBIS_SERVICE_KEY;
  if (!key) return fail(EMPTY, "TAGO 인증키가 설정되지 않았습니다.");

  try {
    const result = await fetchBusPositions(key, routeId);
    if (!result) {
      // 서울 노선 등 TAGO 가 다루지 않는 노선
      return fail(
        { ...EMPTY, routeId, routeName },
        "이 노선은 위치 정보를 제공하지 않습니다 (경기 외 소속 노선).",
      );
    }
    return ok(
      {
        routeId,
        routeName,
        positions: result.positions,
        cityName: result.cityName,
        updatedAt: nowISO(),
      } satisfies BusPositionsPayload,
      undefined,
      CACHE_SEC,
    );
  } catch (e) {
    console.error("[bus-positions]", e);
    return fail(
      { ...EMPTY, routeId, routeName },
      `버스 위치 조회 실패: ${e instanceof Error ? e.message : e}`,
    );
  }
}
