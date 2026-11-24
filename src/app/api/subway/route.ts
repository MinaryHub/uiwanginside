import { ok, fail } from "@/lib/fetcher";
import { fetchUiwangSubway, UIWANG_STATION } from "@/lib/subway";
import { fetchWithSharedCache } from "@/lib/sharedCache";
import type { SubwayPayload } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 15;

const EMPTY = (): SubwayPayload => ({
  stationName: UIWANG_STATION.name,
  lineName: UIWANG_STATION.lineName,
  lat: UIWANG_STATION.lat,
  lng: UIWANG_STATION.lng,
  up: [],
  down: [],
  source: "seoul-sample",
  updatedAt: new Date().toISOString(),
});

export async function GET() {
  const key = process.env.SEOUL_SUBWAY_KEY;
  try {
    const cached = await fetchWithSharedCache<SubwayPayload>({
      key: `subway:${key ? "live" : "sample"}`,
      ttlMs: 25_000,
      staleMaxMs: 3 * 60_000,
      failCooldownMs: 20_000,
      fetcher: async () => {
        const data = await fetchUiwangSubway(key);
        const notice =
          data.source === "seoul-sample"
            ? "서울 열린데이터광장 샘플 키(최대 5건)로 조회 중 — SEOUL_SUBWAY_KEY 등록 시 전체 열차 표시"
            : undefined;
        return { value: data, notice };
      },
    });
    return ok(cached.value, cached.notice, cached.stale ? 15 : 20);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return fail(
      EMPTY(),
      key
        ? `의왕역 1호선 도착정보 조회 실패: ${message}`
        : `의왕역 1호선 조회 실패 (${message}). 서울 열린데이터광장에서 SEOUL_SUBWAY_KEY 를 발급해 등록해 주세요.`,
    );
  }
}
