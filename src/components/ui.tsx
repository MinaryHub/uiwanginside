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
    <section className="border-t border-[var(--border)] px-5 py-5 first:border-t-0">
      <header className="mb-3 flex items-center gap-2">
        <h2 className="text-[length:var(--text-xs)] font-semibold text-[var(--text-muted)]">
          {title}
        </h2>
        {right && <div className="ml-auto flex items-center">{right}</div>}
      </header>
      {children}
    </section>
  );
}

/** 화면에서 가장 크게 읽혀야 하는 수치 */
export function Stat({
  value,
  unit,
  label,
  tone = "default",
}: {
  value: ReactNode;
  unit?: string;
  label: string;
  tone?: "default" | "brand" | "danger" | "warn" | "ok";
}) {
  const color =
    tone === "default"
      ? "var(--text)"
      : tone === "brand"
        ? "var(--brand)"
        : `var(--${tone})`;
  return (
    <div className="flex flex-col">
      <span
        className="tnum text-[length:var(--text-xl)] font-bold leading-none"
        style={{ color }}
      >
        {value}
        {unit && (
          <span className="ml-0.5 text-[length:var(--text-2xs)] font-semibold text-[var(--text-faint)]">
            {unit}
          </span>
        )}
      </span>
      <span className="mt-1 text-[length:var(--text-2xs)] text-[var(--text-muted)]">{label}</span>
    </div>
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

/** 터치 영역 44px 를 지킨다 */
export function Button({
  children,
  onClick,
  variant = "secondary",
  full,
  disabled,
  title,
  type = "button",
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: "primary" | "secondary" | "ghost";
  full?: boolean;
  disabled?: boolean;
  title?: string;
  type?: "button" | "submit";
}) {
  const style =
    variant === "primary"
      ? undefined
      : variant === "secondary"
        ? {
            background: "transparent",
            color: "var(--text)",
            border: "1px solid var(--border-strong)",
          }
        : { color: "var(--text-muted)" };
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`press inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-[var(--radius-full)] px-4 text-[length:var(--text-sm)] font-bold disabled:opacity-45 ${
        full ? "w-full" : ""
      } ${variant === "primary" ? "brand-fill" : ""} ${
        disabled ? "cursor-not-allowed" : "hover:brightness-[0.97]"
      }`}
      style={style}
    >
      {children}
    </button>
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
  // 연동 전에는 아무 표시도 하지 않는다. 가짜 데이터가 없으니 경고할 것도 없다.
  if (!live) return null;
  return (
    <span
      className="inline-flex items-center gap-1.5 text-[length:var(--text-2xs)] font-medium text-[var(--text-muted)]"
      title="실시간 데이터"
    >
      <span className="h-1.5 w-1.5 rounded-full bg-[var(--ok)]" />
      실시간
    </span>
  );
}

/** 데이터를 가져오지 못했을 때 — 값을 지어내지 않고 이유만 알린다 */
export function Unavailable({ reason }: { reason?: string }) {
  return (
    <div className="py-4">
      <p className="text-[length:var(--text-sm)] font-semibold text-[var(--text-muted)]">
        아직 연동되지 않았습니다
      </p>
      {reason && (
        <p className="mt-1 text-[length:var(--text-xs)] leading-relaxed text-[var(--text-faint)]">
          {reason}
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
