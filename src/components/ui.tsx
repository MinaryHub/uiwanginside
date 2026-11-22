"use client";

import type { ReactNode } from "react";

/* ─────────────────────────────────────────────────────────────
   공통 UI.

   미니멀 원칙
   - 정보를 담는 그릇을 그리지 않는다. 테두리·헤더바 대신 여백과
     작은 라벨로 구분한다.
   - 아이콘은 지도 마커에서만 쓴다. 목록·제목의 이모지는 소음이다.
   - 크기·색은 globals.css 토큰만 쓴다.
   ───────────────────────────────────────────────────────────── */

/**
 * 시트 안의 한 구획.
 * 카드가 아니라 섹션이다 — 배경도 테두리도 없고 라벨과 여백만 있다.
 */
export function Section({
  title,
  right,
  children,
}: {
  title: string;
  right?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="border-t-2 border-dashed border-[var(--border)] px-4 py-5 first:border-t-0">
      <header className="mb-3 flex items-center gap-2">
        <h2 className="text-[length:var(--text-base)] font-extrabold text-[var(--text)]">
          {title}
        </h2>
        {right && <div className="ml-auto flex items-center">{right}</div>}
      </header>
      {children}
    </section>
  );
}

export function Badge({
  children,
  tone = "neutral",
  filled = false,
}: {
  children: ReactNode;
  tone?: "neutral" | "brand" | "danger" | "warn" | "ok" | "info";
  filled?: boolean;
}) {
  const color = tone === "neutral" ? "var(--text-muted)" : `var(--${tone})`;
  const soft =
    tone === "neutral"
      ? "var(--surface-3)"
      : `color-mix(in srgb, ${color} 14%, transparent)`;
  return (
    <span
      className="inline-flex shrink-0 items-center gap-1 rounded-[var(--radius-full)] px-2 py-0.5 text-[length:var(--text-2xs)] font-bold"
      style={
        filled ? { background: color, color: "var(--surface)" } : { background: soft, color }
      }
    >
      {children}
    </span>
  );
}

export function Notice({
  children,
  tone = "warn",
}: {
  children: ReactNode;
  tone?: "warn" | "danger" | "info";
}) {
  if (!children) return null;
  const color = `var(--${tone})`;
  return (
    <p
      className="mb-3 rounded-[var(--radius)] px-3.5 py-2.5 text-[length:var(--text-xs)] font-medium leading-relaxed"
      style={{ background: `color-mix(in srgb, ${color} 12%, transparent)`, color }}
    >
      {children}
    </p>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <p className="py-6 text-[length:var(--text-sm)] leading-relaxed text-[var(--text-muted)]">
      {children}
    </p>
  );
}

export function Skeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-2" aria-hidden>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="skeleton h-10 rounded-[var(--radius)]" />
      ))}
    </div>
  );
}

/** ISO 문자열 → "3분 전" */
export function timeAgo(iso: string, nowMs?: number): string {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "";
  const ref = nowMs != null && Number.isFinite(nowMs) ? nowMs : Date.now();
  const diff = Math.max(0, Math.floor((ref - t) / 1000));
  if (diff < 60) return "방금 전";
  if (diff < 3600) return `${Math.floor(diff / 60)}분 전`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}시간 전`;
  return `${Math.floor(diff / 86400)}일 전`;
}

export function hhmm(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Seoul",
  });
}

export function LiveDot({ live, stale = false }: { live: boolean; stale?: boolean }) {
  // 연동 전에는 아무 표시도 하지 않는다. 가짜 데이터가 없으니 경고할 것도 없다.
  if (!live) return null;
  return (
    <span
      className="inline-flex items-center gap-1.5 text-[length:var(--text-2xs)] font-medium text-[var(--text-muted)]"
      title={stale ? "최근 저장본 표시 중" : "실시간 데이터"}
    >
      <span
        className="h-1.5 w-1.5 rounded-full"
        style={{ background: stale ? "var(--warn)" : "var(--ok)" }}
      />
      {stale ? "이전 값" : "실시간"}
    </span>
  );
}

/** 데이터를 가져오지 못했을 때 — 값을 지어내지 않고 이유만 알린다 */
export function Unavailable({
  reason,
  error,
}: {
  reason?: string;
  /** 네트워크 오류 등 클라이언트 요청 자체가 실패했을 때 */
  error?: unknown;
}) {
  const isNetworkError = error != null && !reason;
  const heading = isNetworkError
    ? "정보를 불러오지 못했습니다"
    : "아직 연동되지 않았습니다";
  const detail =
    reason ??
    (isNetworkError
      ? "잠시 후 다시 시도해 주세요. 인터넷 연결이 불안정하거나 서버 응답이 지연되고 있습니다."
      : undefined);

  return (
    <div className="py-4">
      <p className="text-[length:var(--text-sm)] font-semibold text-[var(--text-muted)]">
        {heading}
      </p>
      {detail && (
        <p className="mt-1 text-[length:var(--text-xs)] leading-relaxed text-[var(--text-faint)]">
          {detail}
        </p>
      )}
      <a
        href="/status"
        className="mt-2 inline-flex min-h-[36px] items-center text-[length:var(--text-xs)] font-bold text-[var(--brand)] underline underline-offset-4"
      >
        연동 상태 보기
      </a>
    </div>
  );
}
