import { ok, fail, nowISO } from "@/lib/fetcher";
import { fetchUiwangRoads, ROADS_TTL_SEC } from "@/lib/roads";
import type { RoadsPayload } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * 의왕시 주요도로의 형상.
 *
 * ITS 소통정보에는 좌표가 없어 속도만으로는 지도에 그릴 수 없다.
 * 형상은 여기서 한 번 받아 두고, 속도는 /api/traffic 이 따로 준다.
 * 길은 하루 사이에 바뀌지 않으므로 브라우저·CDN 까지 하루를 준다.
 */
const EMPTY: RoadsPayload = { roads: [], updatedAt: "" };

export async function GET() {
  try {
    const roads = await fetchUiwangRoads();
    if (roads.length === 0) return fail(EMPTY, "도로 형상을 가져오지 못했습니다.");
    return ok({ roads, updatedAt: nowISO() } satisfies RoadsPayload, undefined, ROADS_TTL_SEC);
  } catch (e) {
    console.error("[roads]", e);
    return fail(EMPTY, `도로 형상 조회 실패: ${e instanceof Error ? e.message : e}`);
  }
}
