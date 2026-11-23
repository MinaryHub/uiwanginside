import { ok, fail } from "@/lib/fetcher";
import { fetchLocalCurrency } from "@/lib/localCurrency";
import type { LocalCurrencyPayload } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 20;

const EMPTY = (): LocalCurrencyPayload => ({
  merchants: [],
  totalCount: 0,
  source: "gg",
  updatedAt: new Date().toISOString(),
});

export async function GET() {
  const ggKey = process.env.GG_DATA_KEY;
  if (!ggKey) {
    return fail(
      EMPTY(),
      "GG_DATA_KEY 가 설정되지 않았습니다. 경기데이터드림(data.gg.go.kr) OpenAPI 키를 등록하면 의왕사랑상품권 가맹점을 조회할 수 있습니다.",
    );
  }

  try {
    const data = await fetchLocalCurrency(ggKey);
    return ok(data, undefined, 3600);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return fail(EMPTY(), `의왕사랑상품권 가맹점 조회 실패: ${message}`);
  }
}
