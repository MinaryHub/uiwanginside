import { ok, fail } from "@/lib/fetcher";
import { fetchUiwangShelters } from "@/lib/shelters";
import type { SheltersPayload } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 20;

const EMPTY = (): SheltersPayload => ({
  shelters: [],
  source: "mois",
  updatedAt: new Date().toISOString(),
});

export async function GET() {
  const safetyKey = process.env.SAFETY_DATA_KEY;
  const moisKey = process.env.SHELTER_SERVICE_KEY || process.env.KMA_SERVICE_KEY;

  if (!safetyKey && !moisKey) {
    return fail(
      EMPTY(),
      "SAFETY_DATA_KEY 또는 SHELTER_SERVICE_KEY(KMA_SERVICE_KEY)가 설정되지 않았습니다. 행정안전부 무더위·한파 쉼터 API 활용신청 후 키를 등록해 주세요.",
    );
  }

  try {
    const data = await fetchUiwangShelters({ safetyKey, moisKey });
    return ok(data, undefined, 3600);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return fail(EMPTY(), `무더위·한파 쉼터 조회 실패: ${message}`);
  }
}
