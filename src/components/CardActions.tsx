"use client";

import { useEffect, useState } from "react";
import { copyText, shareLocation, type SharePayload } from "@/lib/share";

/**
 * 상세 카드용 1-탭 주소 복사 · 공유 버튼.
 */
export default function CardActions({
  copyAddress,
  share,
}: {
  copyAddress?: string;
  share?: SharePayload;
}) {
  const [copyState, setCopyState] = useState<"idle" | "done">("idle");
  const [shareState, setShareState] = useState<"idle" | "copied">("idle");

  useEffect(() => {
    if (copyState !== "done") return;
    const t = setTimeout(() => setCopyState("idle"), 1800);
    return () => clearTimeout(t);
  }, [copyState]);

  useEffect(() => {
    if (shareState !== "copied") return;
    const t = setTimeout(() => setShareState("idle"), 1800);
    return () => clearTimeout(t);
  }, [shareState]);

  if (!copyAddress && !share) return null;

  return (
    <div className="mt-2.5 flex flex-wrap gap-1.5">
      {copyAddress && (
        <button
          type="button"
          onClick={async () => {
            if (await copyText(copyAddress)) setCopyState("done");
          }}
          className="press inline-flex min-h-[38px] items-center gap-1 rounded-[var(--radius-full)] border border-[var(--border-strong)] bg-[var(--surface-2)] px-3 text-[length:var(--text-2xs)] font-bold text-[var(--text)]"
        >
          <span aria-hidden>{copyState === "done" ? "✓" : "📋"}</span>
          <span>{copyState === "done" ? "주소 복사됨" : "주소 복사"}</span>
        </button>
      )}
      {share && (
        <button
          type="button"
          onClick={async () => {
            const res = await shareLocation(share);
            if (res === "copied") setShareState("copied");
          }}
          className="press inline-flex min-h-[38px] items-center gap-1 rounded-[var(--radius-full)] border border-[var(--border-strong)] bg-[var(--surface-2)] px-3 text-[length:var(--text-2xs)] font-bold text-[var(--text)]"
        >
          <span aria-hidden>{shareState === "copied" ? "✓" : "🔗"}</span>
          <span>{shareState === "copied" ? "링크 복사됨" : "위치 공유"}</span>
        </button>
      )}
    </div>
  );
}
