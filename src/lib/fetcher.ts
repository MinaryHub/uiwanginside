import type { ApiEnvelope } from "./types";

/** 외부 API 호출 공통 래퍼 — 타임아웃 + 에러 로깅 */
export async function timedFetch(
  url: string,
  init: RequestInit = {},
  timeoutMs = 8000,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
      cache: "no-store",
    });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * CDN 캐시 헤더. maxAge 초 동안 캐시하고, 그 뒤 2배 구간은 갱신하는 동안
 * 이전 응답을 그대로 내보낸다(stale-while-revalidate).
 * 브라우저는 캐시하지 않아 새로고침 시 항상 최신을 받는다.
 */
function cacheHeader(maxAge?: number) {
  return maxAge && maxAge > 0
    ? `public, max-age=0, s-maxage=${maxAge}, stale-while-revalidate=${maxAge * 2}`
    : "no-store";
}

export function ok<T>(data: T, notice?: string, maxAge?: number) {
  return Response.json({ ok: true, data, notice } satisfies ApiEnvelope<T>, {
    headers: { "Cache-Control": cacheHeader(maxAge) },
  });
}

/** 폴백 응답은 캐시하지 않는다 — 키가 들어오면 즉시 정상 응답으로 바뀌어야 한다 */
export function fail<T>(data: T, notice: string) {
  return Response.json({ ok: false, data, notice } satisfies ApiEnvelope<T>, {
    status: 200,
    headers: { "Cache-Control": "no-store" },
  });
}

/** 프로세스 메모리 TTL 캐시 — 같은 좌표 반복 조회로 외부 API 를 낭비하지 않는다 */
export function createTtlCache<T>(ttlMs: number, maxEntries = 200) {
  const store = new Map<string, { at: number; value: T }>();
  return {
    get(key: string): T | undefined {
      const hit = store.get(key);
      if (!hit) return undefined;
      if (Date.now() - hit.at > ttlMs) {
        store.delete(key);
        return undefined;
      }
      return hit.value;
    },
    set(key: string, value: T) {
      // 단순 FIFO 축출 — 엔트리가 작고 TTL 이 짧아 이 정도면 충분하다
      if (store.size >= maxEntries) {
        const oldest = store.keys().next().value;
        if (oldest !== undefined) store.delete(oldest);
      }
      store.set(key, { at: Date.now(), value });
    },
  };
}

/** 클라이언트 SWR fetcher */
export async function swrFetcher<T>(url: string): Promise<ApiEnvelope<T>> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`요청 실패 (${res.status})`);
  return res.json();
}

export function nowISO() {
  return new Date().toISOString();
}
