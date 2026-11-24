import type { ApiEnvelope } from "./types";

/**
 * 외부 API 호출 공통 래퍼 — 응답 헤더뿐 아니라 본문 읽기까지 타임아웃으로 보호한다.
 * AbortSignal.timeout() 은 헤더 수신 후에도 유지되어 스트림이 멈추는 현상을 막는다.
 */
export async function timedFetch(
  url: string,
  init: RequestInit = {},
  timeoutMs = 8000,
): Promise<Response> {
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  const signal = init.signal
    ? AbortSignal.any([init.signal, timeoutSignal])
    : timeoutSignal;
  // cache 옵션을 지정하지 않는다.
  // Next 의 패치된 fetch 에 cache:"no-store" 를 주면 일부 호스트에서
  // 응답이 극단적으로 느려진다 (apis.data.go.kr 실측: 128ms → 58,788ms + 503).
  // 모든 라우트가 force-dynamic 이라 응답이 캐시될 일도 없고,
  // CDN 캐시는 Cache-Control 헤더로 직접 제어한다.
  return fetch(url, { ...init, signal });
}

/**
 * data.go.kr 서비스키 정규화.
 * 공공데이터포털은 Encoding 키(%2F, %2B 포함)와 Decoding 키(+, /, = 포함)를
 * 둘 다 발급한다. 이미 인코딩된 키는 그대로 두고, 원문 키만 URL 인코딩해
 * 어떤 형식을 넣어도 동일하게 동작하게 한다.
 */
export function normalizeServiceKey(key: string): string {
  const trimmed = key.trim();
  return /%[0-9a-fA-F]{2}/.test(trimmed) ? trimmed : encodeURIComponent(trimmed);
}

/** 단일 객체 또는 배열로 오는 XML/JSON 필드를 안전하게 배열로 정규화한다 */
export function asArray<T>(v: T | T[] | null | undefined): T[] {
  if (v == null) return [];
  return Array.isArray(v) ? v : [v];
}

/** KST(UTC+9) 기준 날짜·시각 분해. 호스트 로캘·TZ 에 의존하지 않는다. */
export function kstDateParts(offsetMs = 0) {
  const d = new Date(Date.now() + 9 * 3600_000 + offsetMs);
  const p = (n: number) => String(n).padStart(2, "0");
  const year = d.getUTCFullYear();
  const month = d.getUTCMonth() + 1;
  const day = d.getUTCDate();
  const hour = d.getUTCHours();
  const minute = d.getUTCMinutes();
  const dow = d.getUTCDay(); // 0=일
  return {
    year,
    month,
    day,
    hour,
    minute,
    /** 공공데이터 규격 요일: 1=월 … 7=일 */
    isoDow: dow === 0 ? 7 : dow,
    ymd: `${year}${p(month)}${p(day)}`,
    isoDate: `${year}-${p(month)}-${p(day)}`,
    hh: p(hour),
    mm: p(minute),
    hhmm: hour * 100 + minute,
  };
}

/**
 * CDN 캐시 헤더. maxAge 초 동안 캐시하고, 그 뒤 2배 구간은 갱신하는 동안
 * 이전 응답을 그대로 내보낸다(stale-while-revalidate). 상류 일시 장애 시에는
 * stale-if-error 로 캐시된 정상 응답을 유지해 동시 접속 폭발을 흡수한다.
 * 브라우저는 캐시하지 않아 새로고침 시 항상 최신을 받는다.
 */
function cacheHeader(maxAge?: number) {
  if (!maxAge || maxAge <= 0) return "no-store";
  const swr = Math.min(86_400, maxAge * 2);
  const sie = Math.min(86_400, maxAge * 6);
  return `public, max-age=0, s-maxage=${maxAge}, stale-while-revalidate=${swr}, stale-if-error=${sie}`;
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
  // 99 = 가용 세션 없음(초당 처리량 초과), 04 = 게이트웨이 HTTP 에러.
  // 둘 다 잠시 뒤 다시 부르면 대개 통과한다.
  return /SERVICETIMEOUT|서비스 연결실패|가용한 세션|^0?4:|^0?5:|^22:|^99:|LIMITED_NUMBER/.test(
    m,
  );
}

/** 일시 오류면 잠깐 쉬었다 한 번 더 시도한다 */
export async function retryTransient<T>(
  fn: () => Promise<T>,
  label: string,
  delayMs = 700,
): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (!isTransientDataGoKrError(e)) throw e;
    console.warn(`[${label}] 일시 오류, 재시도:`, e instanceof Error ? e.message : e);
    await new Promise((r) => setTimeout(r, delayMs));
    return fn();
  }
}

/** 프로세스 메모리 TTL 캐시 — 같은 좌표 반복 조회로 외부 API 를 낭비하지 않는다 */
export function createTtlCache<T>(ttlMs: number, maxEntries = 200) {
  const store = new Map<string, { at: number; savedAt: number; value: T }>();
  return {
    get(key: string): T | undefined {
      const hit = store.get(key);
      if (!hit) return undefined;
      if (Date.now() - hit.at > ttlMs) {
        return undefined;
      }
      return hit.value;
    },
    /** 만료된 항목이라도 maxStaleMs 이내라면 상류 장애 시 폴백으로 돌려준다 */
    getStale(key: string, maxStaleMs: number): T | undefined {
      const hit = store.get(key);
      if (!hit) return undefined;
      if (Date.now() - hit.savedAt > maxStaleMs) {
        store.delete(key);
        return undefined;
      }
      return hit.value;
    },
    set(key: string, value: T, customTtlMs?: number) {
      // 이미 있는 키를 갱신할 때는 다른 항목을 밀어내지 않는다
      if (store.has(key)) {
        store.delete(key);
      } else if (store.size >= maxEntries) {
        const oldest = store.keys().next().value;
        if (oldest !== undefined) store.delete(oldest);
      }
      const now = Date.now();
      const at =
        customTtlMs != null && customTtlMs < ttlMs
          ? now - (ttlMs - customTtlMs)
          : now;
      store.set(key, { at, savedAt: now, value });
    },
  };
}

/**
 * 진행 중인 비동기 작업을 키별로 합친다 (single-flight).
 * 콜드 스타트 직후 동시 요청이 몰릴 때 같은 외부 API 를 중복 호출하지 않게 막는다.
 */
export function createInFlight<T>() {
  const pending = new Map<string, Promise<T>>();
  return function run(key: string, fn: () => Promise<T>): Promise<T> {
    const existing = pending.get(key);
    if (existing) return existing;
    const p = fn().finally(() => {
      pending.delete(key);
    });
    pending.set(key, p);
    return p;
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
