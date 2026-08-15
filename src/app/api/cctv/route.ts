import { ok, fail, nowISO } from "@/lib/fetcher";
import { fetchCctv } from "@/lib/cctv";
import type { CctvPayload } from "@/lib/cctvTypes";

export const dynamic = "force-dynamic";

/** 목록만 준다. 영상 주소는 서버에만 둔다. */
const CACHE_SEC = 180;
const EMPTY: CctvPayload = { cameras: [], updatedAt: "" };

export async function GET() {
  try {
    const cameras = (await fetchCctv()).map(({ id, name, road, lat, lng }) => ({
      id, name, road, lat, lng,
    }));
    if (cameras.length === 0) return fail(EMPTY, "의왕 범위의 CCTV 를 찾지 못했습니다.");
    return ok({ cameras, updatedAt: nowISO() } satisfies CctvPayload, undefined, CACHE_SEC);
  } catch (e) {
    console.error("[cctv]", e);
    return fail(EMPTY, `CCTV 목록 조회 실패: ${e instanceof Error ? e.message : e}`);
  }
}
