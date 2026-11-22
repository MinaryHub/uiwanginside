import { ok, fail } from "@/lib/fetcher";
import { fetchUiwangLibraries } from "@/lib/libraries";
import type { LibrariesPayload } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 20;

const EMPTY = (): LibrariesPayload => ({
  libraries: [],
  source: "gg",
  updatedAt: new Date().toISOString(),
});

export async function GET() {
  const ggKey = process.env.GG_DATA_KEY;
  const odcloudKey = process.env.LIBRARY_SERVICE_KEY || process.env.KMA_SERVICE_KEY;

  if (!ggKey && !odcloudKey) {
    return fail(
      EMPTY(),
      "GG_DATA_KEY 또는 LIBRARY_SERVICE_KEY(KMA_SERVICE_KEY)가 설정되지 않았습니다.",
    );
  }

  try {
    const data = await fetchUiwangLibraries({ ggKey, odcloudKey });
    return ok(data, undefined, 3600);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return fail(EMPTY(), `공공도서관 조회 실패: ${message}`);
  }
}
