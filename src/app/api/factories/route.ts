import { after } from "next/server";
import { ok, fail } from "@/lib/fetcher";
import { loadFactories } from "@/lib/factoryApi";
import type { FactoriesPayload } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const EMPTY: FactoriesPayload = {
  asOf: null,
  factories: [],
  source: "odcloud",
  updatedAt: "",
};

export async function GET() {
  try {
    const payload = await loadFactories((work) => after(work));
    // 정적 스냅샷이나 지오코딩이 끝난 공공 API 응답은 길게 캐시한다
    const allGeocoded = payload.factories.every((f) => f.lat != null && f.lng != null);
    return ok(payload, undefined, allGeocoded ? 24 * 60 * 60 : 300);
  } catch (e) {
    console.error("[factories]", e);
    return fail(
      EMPTY,
      e instanceof Error ? e.message : "공장 현황 공공 API 를 불러오지 못했습니다.",
    );
  }
}
