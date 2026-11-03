"use client";

import { useEffect } from "react";

/**
 * 예전에 설치된 서비스워커를 걷어낸다.
 *
 * 사진 공유받기(Web Share Target) 때문에 두었던 것인데 그 기능이 없어졌다.
 * 실시간 공공데이터를 다루는 앱이라 오프라인 캐시는 오히려 위험하므로 새로
 * 등록하지 않는다.
 */
export default function ServiceWorker() {
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker
      .getRegistrations()
      .then((regs) => Promise.all(regs.map((r) => r.unregister())))
      .catch(() => {});
  }, []);
  return null;
}
