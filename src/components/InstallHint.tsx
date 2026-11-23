"use client";

import { useEffect, useState } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DISMISS_KEY = "uiwang.pwaDismiss.v1";

/**
 * 안드로이드 Chrome 등에서 PWA 설치가 가능할 때만 노출되는 1-탭 설치 안내.
 * 이미 앱으로 열렸거나 사용자가 닫으면 다시 띄우지 않는다.
 */
export default function InstallHint() {
  const [promptEvt, setPromptEvt] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(() => {
    if (typeof window === "undefined") return true;
    try {
      return localStorage.getItem(DISMISS_KEY) === "1";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    if (dismissed) return;
    const handler = (e: Event) => {
      e.preventDefault();
      setPromptEvt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, [dismissed]);

  if (!promptEvt || dismissed) return null;

  const install = async () => {
    try {
      await promptEvt.prompt();
      await promptEvt.userChoice;
    } finally {
      setPromptEvt(null);
    }
  };

  const dismiss = () => {
    setDismissed(true);
    setPromptEvt(null);
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="mx-4 mb-3 flex items-center gap-2 rounded-[var(--radius-lg)] border-2 border-[var(--ink)] bg-[var(--brand-soft)] px-3 py-2 text-[length:var(--text-xs)]">
      <span aria-hidden className="text-base">
        📲
      </span>
      <span className="min-w-0 flex-1 font-bold leading-snug text-[var(--text)]">
        홈 화면에 앱으로 추가해 바로 열기
      </span>
      <button
        type="button"
        onClick={install}
        className="brand-fill press shrink-0 rounded-full border-2 px-3 py-1 text-[length:var(--text-2xs)] font-extrabold shadow-[var(--shadow-sm)]"
      >
        설치
      </button>
      <button
        type="button"
        onClick={dismiss}
        aria-label="설치 안내 닫기"
        className="px-1 text-[var(--text-muted)]"
      >
        ✕
      </button>
    </div>
  );
}
