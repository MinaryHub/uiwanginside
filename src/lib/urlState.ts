"use client";

import { useEffect, useRef } from "react";
import type { ReadonlyURLSearchParams } from "next/navigation";
import { UIWANG } from "./uiwang";
import { isModeId, type ModeId } from "./modes";

/**
 * 지도·필터 상태를 URL 쿼리로 주고받는다.
 * 시민 포털에서는 "청계동 병원" 같은 화면을 링크로 공유하는 게 주 유입 경로라
 * 상태가 컴포넌트 안에만 있으면 공유·북마크가 불가능하다.
 */

export interface UrlState {
  mode: ModeId;
  lat: number;
  lng: number;
  level: number;
  radius: number;
}

export const DEFAULT_STATE: UrlState = {
  mode: "explore",
  lat: UIWANG.center.lat,
  lng: UIWANG.center.lng,
  level: 7,
  radius: UIWANG.defaultRadius,
};

function numOr(raw: string | null, fallback: number, min: number, max: number) {
  const n = Number(raw);
  return raw !== null && Number.isFinite(n) && n >= min && n <= max ? n : fallback;
}

/** URL → 상태. 잘못된 값은 조용히 기본값으로 되돌린다 (링크가 깨져도 화면은 떠야 한다) */
export function parseUrlState(sp: ReadonlyURLSearchParams | URLSearchParams): UrlState {
  const m = sp.get("m");
  return {
    mode: isModeId(m) ? m : DEFAULT_STATE.mode,
    lat: numOr(sp.get("lat"), DEFAULT_STATE.lat, 33, 39),
    lng: numOr(sp.get("lng"), DEFAULT_STATE.lng, 124, 132),
    level: numOr(sp.get("z"), DEFAULT_STATE.level, 1, 12),
    radius: numOr(sp.get("r"), DEFAULT_STATE.radius, 500, 20000),
  };
}

function toQuery(s: UrlState): string {
  const p = new URLSearchParams();
  // 기본값과 같은 항목은 URL 에 넣지 않아 링크를 짧게 유지한다
  if (s.lat.toFixed(4) !== DEFAULT_STATE.lat.toFixed(4)) p.set("lat", s.lat.toFixed(4));
  if (s.lng.toFixed(4) !== DEFAULT_STATE.lng.toFixed(4)) p.set("lng", s.lng.toFixed(4));
  if (s.level !== DEFAULT_STATE.level) p.set("z", String(s.level));
  if (s.radius !== DEFAULT_STATE.radius) p.set("r", String(s.radius));
  if (s.mode !== DEFAULT_STATE.mode) p.set("m", s.mode);
  return p.toString();
}

/**
 * 상태가 바뀌면 주소창을 갱신한다.
 * router.replace 는 렌더를 다시 태우므로 history API 를 직접 쓴다.
 * 지도 조작 중 히스토리가 폭주하지 않도록 지연을 둔다.
 */
export function useSyncUrl(state: UrlState, delay = 600) {
  const last = useRef("");

  useEffect(() => {
    const t = setTimeout(() => {
      const qs = toQuery(state);
      if (qs === last.current) return;
      last.current = qs;
      const url = qs ? `${window.location.pathname}?${qs}` : window.location.pathname;
      window.history.replaceState(null, "", url);
    }, delay);
    return () => clearTimeout(t);
  }, [state, delay]);
}

/** 현재 화면을 가리키는 공유용 절대 URL */
export function shareUrl(state: UrlState): string {
  const qs = toQuery(state);
  const { origin, pathname } = window.location;
  return qs ? `${origin}${pathname}?${qs}` : `${origin}${pathname}`;
}
