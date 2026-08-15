import { ok, nowISO } from "@/lib/fetcher";
import { UIWANG_CCTV } from "@/lib/uiwang-cctv";
import type { CctvPayload } from "@/lib/cctvTypes";

/**
 * 카메라 목록.
 *
 * ITS 를 부르지 않는다. 이름·노선·좌표는 바뀌지 않아 소스에 굳혀 두었고
 * (scripts/fetch-cctv.mjs), ITS 는 Vercel 에서 이따금 막히기 때문이다.
 * 목록이 늘 나와야 지도에서 카메라가 통째로 사라지지 않는다.
 */
const CACHE_SEC = 24 * 60 * 60;

export async function GET() {
  const cameras = UIWANG_CCTV.map(({ id, name, road, lat, lng }) => ({
    id, name, road, lat, lng,
  }));
  return ok({ cameras, updatedAt: nowISO() } satisfies CctvPayload, undefined, CACHE_SEC);
}
