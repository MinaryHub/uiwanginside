import { ok, nowISO } from "@/lib/fetcher";
import { UIWANG_ROADS } from "@/lib/uiwang-roads";
import type { RoadsPayload } from "@/lib/types";

/**
 * 의왕시 주요도로의 형상.
 *
 * ITS 소통정보에는 좌표가 없어 속도만으로는 지도에 그릴 수 없다.
 * 형상은 정적 자료라 소스에 굳혀 두었다 (scripts/fetch-roads.mjs).
 * 100KB 를 모든 방문자에게 지울 이유는 없어 별도 경로로 두고,
 * 교통 모드를 켠 사람만 한 번 받아 간다. 브라우저·CDN 에 하루를 준다.
 */
const CACHE_SEC = 24 * 60 * 60;

export async function GET() {
  return ok(
    { roads: UIWANG_ROADS, updatedAt: nowISO() } satisfies RoadsPayload,
    undefined,
    CACHE_SEC,
  );
}
