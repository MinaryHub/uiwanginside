import { ok, fail } from "@/lib/fetcher";
import { fetchEvChargers } from "@/lib/evChargers";
import { fetchWithSharedCache } from "@/lib/sharedCache";
import type { EvChargersPayload } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 20;

const EMPTY = (): EvChargersPayload => ({
  stations: [],
  source: "keco",
  updatedAt: new Date().toISOString(),
});

export async function GET() {
  const key = process.env.EV_CHARGER_SERVICE_KEY || process.env.KMA_SERVICE_KEY;
  if (!key) {
    return fail(
      EMPTY(),
      "EV_CHARGER_SERVICE_KEY(또는 KMA_SERVICE_KEY)가 설정되지 않았습니다. 공공데이터포털에서 '한국환경공단_전기자동차 충전소 정보' 활용신청 후 키를 등록해 주세요.",
    );
  }

  try {
    const cached = await fetchWithSharedCache<EvChargersPayload>({
      key: "ev-chargers",
      ttlMs: 3 * 60_000,
      staleMaxMs: 60 * 60_000,
      failCooldownMs: 60_000,
      fetcher: async () => ({ value: await fetchEvChargers(key) }),
    });
    return ok(cached.value, cached.notice, cached.stale ? 60 : 120);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return fail(EMPTY(), `전기차 충전소 조회 실패: ${message}`);
  }
}
