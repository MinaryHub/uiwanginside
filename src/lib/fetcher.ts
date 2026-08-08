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

export function ok<T>(data: T, notice?: string) {
  return Response.json({ ok: true, data, notice } satisfies ApiEnvelope<T>, {
    headers: { "Cache-Control": "no-store" },
  });
}

export function fail<T>(data: T, notice: string) {
  return Response.json({ ok: false, data, notice } satisfies ApiEnvelope<T>, {
    status: 200,
    headers: { "Cache-Control": "no-store" },
  });
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
