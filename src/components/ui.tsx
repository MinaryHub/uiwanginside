"use client";

import type { ReactNode } from "react";

export function Card({
  title,
  icon,
  right,
  children,
  className = "",
}: {
  title?: string;
  icon?: string;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-xl border border-[var(--border)] bg-[var(--surface)] ${className}`}
    >
      {title && (
        <header className="flex items-center justify-between gap-2 border-b border-[var(--border)] px-3.5 py-2.5">
          <h2 className="flex items-center gap-1.5 text-[13px] font-bold tracking-tight">
            {icon && <span>{icon}</span>}
            {title}
          </h2>
          {right}
        </header>
      )}
      <div className="p-3.5">{children}</div>
    </section>
  );
}

export function Badge({
  children,
  color = "var(--muted)",
  filled = false,
}: {
  children: ReactNode;
  color?: string;
  filled?: boolean;
}) {
  return (
    <span
      className="inline-flex shrink-0 items-center rounded-md px-1.5 py-0.5 text-[10.5px] font-bold"
      style={
        filled
          ? { background: color, color: "#fff" }
          : { border: `1px solid ${color}`, color }
      }
    >
      {children}
    </span>
  );
}

export function Notice({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <p className="mb-2.5 rounded-lg bg-amber-500/10 px-2.5 py-1.5 text-[11px] leading-snug text-amber-700 dark:text-amber-300">
      ⚠️ {children}
    </p>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <p className="py-6 text-center text-[12.5px] text-[var(--muted)]">{children}</p>
  );
}

export function Skeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="h-9 animate-pulse rounded-lg bg-[var(--surface-2)]"
          style={{ animationDelay: `${i * 90}ms` }}
        />
      ))}
    </div>
  );
}

/** ISO 문자열 → "3분 전" */
export function timeAgo(iso: string): string {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "";
  const diff = Math.floor((Date.now() - t) / 1000);
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

export function LiveDot({ live }: { live: boolean }) {
  // 연동 전에는 아무 뱃지도 달지 않는다.
  // 가짜 데이터를 표시하지 않으므로 "SAMPLE" 같은 표시가 필요 없다.
  if (!live) return null;
  return (
    <span
      className="inline-flex items-center gap-1 text-[10.5px] font-semibold"
      style={{ color: "var(--brand)" }}
      title="실시간 데이터"
    >
      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
      LIVE
    </span>
  );
}

/**
 * 데이터를 가져오지 못했을 때의 표시.
 * 값을 지어내지 않고 왜 없는지만 알린다.
 */
export function Unavailable({ reason }: { reason?: string }) {
  return (
    <div className="rounded-lg bg-[var(--surface-2)] px-3 py-4 text-center">
      <p className="text-[12.5px] font-semibold text-[var(--muted)]">
        아직 연동되지 않았습니다
      </p>
      {reason && (
        <p className="mx-auto mt-1 max-w-[260px] text-[11px] leading-snug text-[var(--muted)]">
          {reason}
        </p>
      )}
      <a
        href="/status"
        className="mt-2 inline-block text-[11px] font-bold text-[var(--brand)] underline underline-offset-2"
      >
        연동 상태 보기 →
      </a>
    </div>
  );
}
