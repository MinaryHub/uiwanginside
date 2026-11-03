"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";

/**
 * 접속 기록을 보낸다.
 *
 * 방문자 구분은 브라우저가 스스로 만든 임의의 값으로만 한다. 서버가
 * 발급하지 않으므로 사용자가 지우면 그만이고, 다른 곳으로 나가지도 않는다.
 * 쿠키가 아니라 localStorage 를 쓰는 이유도 같다 — 요청마다 딸려 가지 않는다.
 */
const VISITOR_KEY = "uiwang.visitor";
const SESSION_KEY = "uiwang.session";
/** 같은 화면을 연달아 세지 않는다 */
const DEDUPE_MS = 30_000;

function id(store: Storage, key: string): string {
  try {
    const cur = store.getItem(key);
    if (cur) return cur;
    const next = crypto.randomUUID();
    store.setItem(key, next);
    return next;
  } catch {
    // 시크릿 모드 등 저장이 막힌 경우. 이번 한 번만 쓰고 버린다.
    return crypto.randomUUID();
  }
}

function device(): "mobile" | "tablet" | "desktop" {
  const w = window.innerWidth;
  const touch = window.matchMedia("(pointer: coarse)").matches;
  if (touch && w < 768) return "mobile";
  if (touch) return "tablet";
  return "desktop";
}

const lastSent = new Map<string, number>();

/** 식별자가 든 경로를 틀로 바꾼다 */
function collapse(pathname: string): string {
  if (pathname.startsWith("/stats/")) return "/stats/[token]";
  return pathname;
}

export default function VisitTracker() {
  const pathname = usePathname();
  const params = useSearchParams();
  // 어떤 목적으로 왔는지. 지도를 옮길 때마다 바뀌는 좌표는 보내지 않는다.
  const mode = params.get("m");

  useEffect(() => {
    if (typeof window === "undefined") return;
    /*
     * 주소의 일부가 곧 열쇠인 화면은 경로를 뭉뚱그린다.
     *
     * /stats/<토큰> 을 그대로
     * 보내면 통계 표의 "인기 화면" 칸에 자기 비밀 주소가 적힌다.
     */
    const path = collapse(pathname);

    const key = `${path}|${mode ?? ""}`;
    const now = Date.now();
    if (now - (lastSent.get(key) ?? 0) < DEDUPE_MS) return;
    lastSent.set(key, now);

    const payload = JSON.stringify({
      path,
      mode,
      referrer: document.referrer || null,
      device: device(),
      visitorId: id(localStorage, VISITOR_KEY),
      sessionId: id(sessionStorage, SESSION_KEY),
    });

    // keepalive 를 주면 화면을 바로 떠나도 요청이 끊기지 않는다
    void fetch("/api/visit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payload,
      keepalive: true,
    }).catch(() => {
      /* 통계 때문에 사용자 화면이 흔들릴 이유는 없다 */
    });
  }, [pathname, mode]);

  return null;
}
