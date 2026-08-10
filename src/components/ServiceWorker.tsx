"use client";

import { useEffect } from "react";

/**
 * 서비스워커 등록.
 * 폰 갤러리에서 공유받으려면(Web Share Target) 서비스워커가 있어야 한다.
 */
export default function ServiceWorker() {
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // 등록 실패해도 앱 기능에는 영향이 없다. 공유 수신만 못 쓴다.
    });
  }, []);
  return null;
}
