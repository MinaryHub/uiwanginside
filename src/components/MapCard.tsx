"use client";

import type { ReactNode } from "react";

/**
 * 지도에서 무언가를 고르면 뜨는 카드의 껍데기.
 *
 * 마커 옆 말풍선이 아니라 하단 고정이다. 말풍선은 화면 끝 마커에서 잘리고
 * 모바일에서 특히 좁다. 무엇을 누르든 같은 자리에 같은 크기로 나온다.
 */
export default function MapCard({
  title,
  subtitle,
  accent,
  onClose,
  children,
}: {
  title: string;
  subtitle?: ReactNode;
  /** 좌측 색 띠 — 종류를 색으로만 구분하지 않도록 제목과 함께 쓴다 */
  accent?: string;
  onClose: () => void;
  children?: ReactNode;
}) {
  return (
    <div
      className="fade-up absolute inset-x-3 bottom-3 z-30 mx-auto max-w-[420px] overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-lg)] sm:left-auto sm:right-3"
      style={accent ? { borderLeft: `3px solid ${accent}` } : undefined}
    >
      <div className="max-h-[52vh] overflow-y-auto p-4 thin-scroll">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-[var(--text-base)] font-extrabold">{title}</h3>
            {subtitle && (
              <div className="mt-0.5 text-[var(--text-xs)] text-[var(--text-muted)]">
                {subtitle}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-[var(--radius)] text-[var(--text-base)] text-[var(--text-muted)] transition hover:bg-[var(--surface-2)]"
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
