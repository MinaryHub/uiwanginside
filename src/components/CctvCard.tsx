"use client";

import { useCallback, useEffect, useState } from "react";
import type { Cctv } from "@/lib/cctvTypes";

/**
 * 도로 CCTV 한 대.
 *
 * ITS 가 주는 실시간 스트림은 HLS 라 브라우저마다 재생 방식이 갈리고
 * 라이브러리를 얹어야 한다. 길 상태를 확인하는 데는 몇 초마다 갱신되는
 * 정지영상으로 충분하고, 데이터도 훨씬 적게 든다.
 *
 * 원본은 http 로만 열려 브라우저가 막으므로 서버가 중계한다.
 */
const REFRESH_MS = 10_000;

export default function CctvCard({ cctv, onClose }: { cctv: Cctv; onClose: () => void }) {
  /** 주소를 바꿔야 브라우저가 다시 받아온다 */
  const [stamp, setStamp] = useState(() => Date.now());
  const [state, setState] = useState<"loading" | "ok" | "error">("loading");
  const [live, setLive] = useState(true);

  const reload = useCallback(() => {
    setState("loading");
    setStamp(Date.now());
  }, []);

  // 카메라를 바꾸면 부모가 key 로 이 카드를 다시 만들므로
  // 여기서 상태를 되돌릴 필요가 없다.

  useEffect(() => {
    if (!live) return;
    const t = setInterval(() => setStamp(Date.now()), REFRESH_MS);
    // 화면을 보고 있지 않으면 받아올 이유가 없다
    const onVis = () => setLive(!document.hidden);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [live]);

  return (
    <div className="fade-up absolute inset-x-3 bottom-3 z-30 mx-auto max-w-[440px] overflow-hidden rounded-[var(--radius-xl)] bg-[var(--surface)] shadow-[var(--shadow-lg)] ring-1 ring-[var(--glass-ring)]">
      <div className="flex items-center gap-2 px-3 py-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[length:var(--text-sm)] font-bold">
            📹 {cctv.name}
          </p>
          {cctv.road && (
            <p className="truncate text-[length:var(--text-2xs)] text-[var(--text-muted)]">
              {cctv.road}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={reload}
          aria-label="지금 다시 받기"
          title="지금 다시 받기"
          className="grid h-10 w-10 shrink-0 place-items-center rounded-[var(--radius)] text-[var(--text-muted)] transition hover:bg-[var(--surface-2)]"
        >
          ↻
        </button>
        <button
          type="button"
          onClick={onClose}
          aria-label="닫기"
          className="grid h-10 w-10 shrink-0 place-items-center rounded-[var(--radius)] text-[var(--text-muted)] transition hover:bg-[var(--surface-2)]"
        >
          ✕
        </button>
      </div>

      <div className="relative bg-black" style={{ aspectRatio: "3 / 2" }}>
        {/* 서버가 중계하는 이미지라 next/image 최적화 대상이 아니다 */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          key={stamp}
          src={`/api/cctv/image?id=${cctv.id}&t=${stamp}`}
          alt={`${cctv.name} 도로 상황`}
          className="h-full w-full object-contain"
          onLoad={() => setState("ok")}
          onError={() => setState("error")}
        />
        {state !== "ok" && (
          <p className="absolute inset-0 grid place-items-center text-[length:var(--text-xs)] font-semibold text-white/80">
            {state === "loading" ? "받는 중…" : "지금은 영상을 받을 수 없습니다"}
          </p>
        )}
      </div>

      <p className="px-3 py-1.5 text-[length:var(--text-2xs)] text-[var(--text-faint)]">
        {REFRESH_MS / 1000}초마다 자동 갱신 · 국가교통정보센터 제공 정지영상
      </p>
    </div>
  );
}
