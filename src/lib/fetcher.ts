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
    // cache 옵션을 지정하지 않는다.
    // Next 의 패치된 fetch 에 cache:"no-store" 를 주면 일부 호스트에서
    // 응답이 극단적으로 느려진다 (apis.data.go.kr 실측: 128ms → 58,788ms + 503).
    // 모든 라우트가 force-dynamic 이라 응답이 캐시될 일도 없고,
    // CDN 캐시는 Cache-Control 헤더로 직접 제어한다.
    return await fetch(url, { ...init, signal: controller.signal });
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

/**
 * data.go.kr 응답 파서.
 *
 * 게이트웨이 단계의 오류(인증 실패, 백엔드 타임아웃 등)는 서비스 본래 스키마가
 * 아니라 OpenAPI_ServiceResponse 봉투로 내려온다. 이걸 그냥 파싱하면
 * items 가 undefined 가 되어 "데이터 없음" 으로 둔갑하므로 반드시 먼저 걸러낸다.
 * XML 로 오는 경우도 있어 문자열 형태부터 확인한다.
 */
export function parseDataGoKr(text: string): unknown {
  const trimmed = text.trimStart();

  if (trimmed.startsWith("<")) {
    const code = /<returnReasonCode>([^<]+)</.exec(text)?.[1];
    const msg =
      /<returnAuthMsg>([^<]+)</.exec(text)?.[1] ?? /<errMsg>([^<]+)</.exec(text)?.[1];
    throw new Error(code ? `${code}: ${msg ?? "게이트웨이 오류"}` : `XML 오류 응답`);
  }

  const json = JSON.parse(text);
  const gw = (json as Record<string, { cmmMsgHeader?: Record<string, string> }>)
    ?.OpenAPI_ServiceResponse?.cmmMsgHeader;
  if (gw) {
    throw new Error(
      `${gw.returnReasonCode}: ${gw.returnAuthMsg ?? gw.errMsg ?? "게이트웨이 오류"}`,
    );
  }

  const header = (json as { response?: { header?: Record<string, string> } })?.response
    ?.header;
  if (header?.resultCode && String(header.resultCode) !== "00") {
    throw new Error(`${header.resultCode}: ${header.resultMsg}`);
  }
  return json;
}

/** 일시적 게이트웨이 오류는 한 번 더 시도할 가치가 있다 */
export function isTransientDataGoKrError(e: unknown): boolean {
  const m = e instanceof Error ? e.message : "";
  return /SERVICETIMEOUT|서비스 연결실패|^05:|^22:|LIMITED_NUMBER/.test(m);
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
