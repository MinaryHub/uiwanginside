import { ok, fail } from "@/lib/fetcher";
import { fetchUiwangLibraries } from "@/lib/libraries";
import { fetchWithSharedCache } from "@/lib/sharedCache";
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
    const cached = await fetchWithSharedCache<LibrariesPayload>({
      key: "libraries",
      ttlMs: 12 * 3600_000,
      staleMaxMs: 72 * 3600_000,
      failCooldownMs: 120_000,
      fetcher: async () => ({ value: await fetchUiwangLibraries({ ggKey, odcloudKey }) }),
    });
    return ok(cached.value, cached.notice, cached.stale ? 300 : 3600);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return fail(EMPTY(), `공공도서관 조회 실패: ${message}`);
  }
}
