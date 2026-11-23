"use client";

import Icon from "@/components/Icon";
import { useSwipeDismiss } from "@/lib/useSwipeDismiss";
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
  const swipe = useSwipeDismiss(onClose, 56);

  return (
    <div
      style={
        swipe.dragging
          ? { transform: `translateY(${swipe.dragY}px)`, transition: "none" }
          : undefined
      }
      className="pop-in absolute inset-x-3 bottom-[calc(var(--dock-h)+8px)] z-30 mx-auto max-w-[440px] overflow-hidden rounded-[var(--radius-xl)] border-2 border-[var(--ink)] bg-[var(--surface)] shadow-[var(--shadow-lg)] transition-transform duration-150"
    >
      {/* 모바일 스와이프 닫기 손잡이 */}
      <div
        {...swipe.handlers}
        className="flex touch-none justify-center pt-2 pb-1 sm:hidden"
        aria-hidden
      >
        <span className="h-1 w-10 rounded-full bg-[var(--border-strong)] opacity-35" />
      </div>
      {/* 종류 색은 제목 앞 작은 점 하나로만 */}
      <div className="thin-scroll max-h-[54dvh] overflow-y-auto overscroll-contain px-4 pb-4 pt-1 sm:p-5">
        <div {...swipe.handlers} className="flex touch-none items-start gap-2 sm:touch-auto">
          <div className="min-w-0 flex-1">
            <h3 className="flex items-center gap-2 truncate text-[length:var(--text-lg)] font-bold">
              {accent && (
                <span aria-hidden className="h-2 w-2 shrink-0 rounded-full" style={{ background: accent }} />
              )}
              {title}
            </h3>
            {subtitle && (
              <div className="mt-0.5 text-[length:var(--text-xs)] text-[var(--text-muted)]">
                {subtitle}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="press grid h-11 w-11 shrink-0 place-items-center rounded-[var(--radius-full)] text-[length:var(--text-sm)] text-[var(--text-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]"
          >
            <Icon name="close" size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
