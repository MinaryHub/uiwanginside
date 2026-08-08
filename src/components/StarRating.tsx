"use client";

import { useState } from "react";

/** 읽기 전용 별 표시 — 0.1 단위 평균을 반쪽 별까지 보여준다 */
export function Stars({ value, size = 13 }: { value: number; size?: number }) {
  const pct = Math.max(0, Math.min(100, (value / 5) * 100));
  return (
    <span
      className="relative inline-block leading-none"
      style={{ fontSize: size }}
      aria-label={`별점 ${value.toFixed(1)}점 / 5점`}
    >
      <span className="text-[var(--border)]">★★★★★</span>
      <span
        className="absolute left-0 top-0 overflow-hidden whitespace-nowrap text-amber-500"
        style={{ width: `${pct}%` }}
        aria-hidden
      >
        ★★★★★
      </span>
    </span>
  );
}

/** 입력용 별 — 누르면 그 값으로 확정한다 */
export function StarInput({
  value,
  onChange,
  disabled,
  size = 22,
}: {
  value: number | null;
  onChange: (stars: number) => void;
  disabled?: boolean;
  size?: number;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const shown = hover ?? value ?? 0;

  return (
    <span className="inline-flex items-center gap-0.5" role="group" aria-label="별점 선택">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          disabled={disabled}
          onClick={() => onChange(n)}
          onMouseEnter={() => !disabled && setHover(n)}
          onMouseLeave={() => setHover(null)}
          aria-label={`${n}점`}
          aria-pressed={value === n}
          className="leading-none transition disabled:cursor-not-allowed"
          style={{
            fontSize: size,
            color: n <= shown ? "var(--warn)" : "var(--border)",
            opacity: disabled ? 0.5 : 1,
          }}
        >
          ★
        </button>
      ))}
    </span>
  );
}
