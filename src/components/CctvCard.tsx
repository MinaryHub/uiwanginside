"use client";

import { useCallback, useEffect, useState } from "react";
import Icon from "@/components/Icon";
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
  const [shownSrc, setShownSrc] = useState<string | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "error">("loading");
  const [live, setLive] = useState(() => (typeof document === "undefined" ? true : !document.hidden));

  const reload = useCallback(() => {
    setStamp(Date.now());
  }, []);

  // 화면을 보고 있지 않으면 받아올 이유가 없다. 다시 돌아오면 재개한다.
  useEffect(() => {
    const onVis = () => {
      const visible = !document.hidden;
      setLive(visible);
      if (visible) setStamp(Date.now());
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  useEffect(() => {
    if (!live) return;
    const t = setInterval(() => setStamp(Date.now()), REFRESH_MS);
    return () => clearInterval(t);
  }, [live]);

  // 다음 프레임을 미리 받아온 뒤 바꿔치기해 10초마다 검게 깜빡이는 현상을 없앤다
  useEffect(() => {
    let cancelled = false;
    const nextUrl = `/api/cctv/image?id=${encodeURIComponent(cctv.id)}&t=${stamp}`;
    const img = new Image();
    img.onload = () => {
      if (cancelled) return;
      setShownSrc(nextUrl);
      setState("ok");
    };
    img.onerror = () => {
      if (cancelled) return;
      setState("error");
    };
    img.src = nextUrl;
    return () => {
      cancelled = true;
    };
  }, [cctv.id, stamp]);

  return (
    <div className="pop-in absolute inset-x-3 bottom-[calc(var(--dock-h)+8px)] z-30 mx-auto max-w-[440px] overflow-hidden rounded-[var(--radius-xl)] border-2 border-[var(--ink)] bg-[var(--surface)] shadow-[var(--shadow-lg)]">
      <div className="flex items-center gap-2 px-3 py-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[length:var(--text-sm)] font-bold">
            <span aria-hidden>📹 </span>
            {cctv.name}
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
          className="press grid h-11 w-11 shrink-0 place-items-center rounded-[var(--radius-full)] text-[var(--text-muted)] transition hover:bg-[var(--surface-2)] hover:text-[var(--text)]"
        >
          <Icon name="refresh" size={18} />
        </button>
        <button
          type="button"
          onClick={onClose}
          aria-label="닫기"
          className="press grid h-11 w-11 shrink-0 place-items-center rounded-[var(--radius-full)] text-[var(--text-muted)] transition hover:bg-[var(--surface-2)] hover:text-[var(--text)]"
        >
          <Icon name="close" size={18} />
        </button>
      </div>

      <div className="relative bg-black" style={{ aspectRatio: "3 / 2" }}>
        {shownSrc && (
          <>
            {/* 서버가 중계하는 이미지라 next/image 최적화 대상이 아니다 */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={shownSrc}
              alt={`${cctv.name} 도로 상황`}
              className="h-full w-full object-contain"
            />
          </>
        )}
        {state !== "ok" && (
          <p
            className="absolute inset-0 grid place-items-center text-[length:var(--text-xs)] font-semibold text-white/90"
            style={shownSrc ? { background: "rgba(0,0,0,0.45)" } : undefined}
          >
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
