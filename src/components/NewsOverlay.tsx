"use client";

import { useEffect, useRef } from "react";
import NewsPanel from "@/components/panels/NewsPanel";
import type { ApiEnvelope, NewsPayload } from "@/lib/types";

/**
 * 뉴스를 상단에서 바로 펼친다.
 *
 * 예전에는 생활 모드 시트 안, 장소 목록 아래에 있었다. 목록이 297곳으로
 * 늘자 아홉 화면을 내려야 닿았고, 목록을 접어도 여전히 모드를 고른 뒤에야
 * 볼 수 있었다. 뉴스는 어느 모드에 속한 정보가 아니라 "지금 의왕에 무슨
 * 일이 있나" 이므로 상단 요약줄에서 바로 열린다.
 *
 * 주제 알약(의왕 교통·의왕 사고 …)까지 그대로 쓰므로 여러 뉴스를 옮겨
 * 다니며 볼 수 있다.
 */
export default function NewsOverlay({
  res,
  isLoading,
  query,
  onQueryChange,
  onClose,
}: {
  res?: ApiEnvelope<NewsPayload>;
  isLoading: boolean;
  query: string;
  onQueryChange: (q: string) => void;
  onClose: () => void;
}) {
  const boxRef = useRef<HTMLDivElement>(null);

  // 바깥을 누르거나 Esc 로 닫는다 — 지도를 만지려는데 걸리면 성가시다
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  return (
    <div className="pointer-events-none absolute inset-x-0 top-[104px] z-50 flex justify-center px-3 sm:top-[64px]">
      <div
        ref={boxRef}
        className="fade-up pointer-events-auto flex max-h-[70vh] w-full max-w-[520px] flex-col overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-lg)]"
      >
        <div className="flex items-center gap-2 border-b border-[var(--border)] px-3 py-1.5">
          <p className="flex-1 text-[var(--text-xs)] font-bold text-[var(--text-muted)]">
            의왕 뉴스
          </p>
          <button
            type="button"
            onClick={onClose}
            aria-label="뉴스 닫기"
            className="grid h-10 w-10 shrink-0 place-items-center rounded-[var(--radius)] text-[var(--text-muted)] transition hover:bg-[var(--surface-2)]"
          >
            ✕
          </button>
        </div>
        {/* 시트에 있던 패널을 그대로 쓴다 — 주제 알약과 목록이 이미 여기 있다 */}
        <div className="thin-scroll min-h-0 flex-1 overflow-y-auto">
          <NewsPanel
            res={res}
            isLoading={isLoading}
            query={query}
            onQueryChange={onQueryChange}
          />
        </div>
      </div>
    </div>
  );
}
