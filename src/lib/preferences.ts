"use client";

import { useSyncExternalStore } from "react";
import type { BusStop } from "./types";

/**
 * 로그인 없이 브라우저에만 저장하는 개인 편의 설정.
 *
 * - 자주 타는 버스 정류소 (최대 5곳)
 * - 우리 동네 기본 시작 위치 (의왕시 6개 행정동 중 1곳)
 *
 * 서버나 DB 에 전혀 전송하지 않으며, useSyncExternalStore 로
 * SSR 하이드레이션 불일치와 React 19 lint 경고 없이 동기화한다.
 */

export interface SavedStop {
  stationId: string;
  name: string;
  mobileNo: string;
  lat: number;
  lng: number;
}

const STOPS_KEY = "uiwang.savedStops.v1";
const DONG_KEY = "uiwang.homeDong.v1";
const MAX_SAVED_STOPS = 5;

const listeners = new Set<() => void>();
const EMPTY_STOPS: SavedStop[] = [];

// useSyncExternalStore 는 스냅샷 참조가 안정적이어야 무한 리렌더가 나지 않는다
let cachedStopsRaw: string | null | undefined;
let cachedStops: SavedStop[] = EMPTY_STOPS;

function emit() {
  cachedStopsRaw = undefined;
  for (const fn of listeners) fn();
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  const onStorage = (e: StorageEvent) => {
    if (e.key === STOPS_KEY || e.key === DONG_KEY) {
      cachedStopsRaw = undefined;
      cb();
    }
  };
  if (typeof window !== "undefined") window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(cb);
    if (typeof window !== "undefined") window.removeEventListener("storage", onStorage);
  };
}

function getStopsSnapshot(): SavedStop[] {
  if (typeof window === "undefined") return EMPTY_STOPS;
  try {
    const raw = localStorage.getItem(STOPS_KEY);
    if (raw === cachedStopsRaw) return cachedStops;
    cachedStopsRaw = raw;
    if (!raw) {
      cachedStops = EMPTY_STOPS;
      return cachedStops;
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      cachedStops = EMPTY_STOPS;
      return cachedStops;
    }
    cachedStops = parsed
      .filter(
        (x): x is SavedStop =>
          x &&
          typeof x.stationId === "string" &&
          typeof x.name === "string" &&
          typeof x.lat === "number" &&
          typeof x.lng === "number",
      )
      .slice(0, MAX_SAVED_STOPS);
    return cachedStops;
  } catch {
    return EMPTY_STOPS;
  }
}

function getHomeDongSnapshot(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(DONG_KEY) || null;
  } catch {
    return null;
  }
}

export function useSavedStops(): SavedStop[] {
  return useSyncExternalStore(subscribe, getStopsSnapshot, () => EMPTY_STOPS);
}

export function useHomeDong(): string | null {
  return useSyncExternalStore(subscribe, getHomeDongSnapshot, () => null);
}

export function toggleSavedStop(stop: Pick<BusStop, "stationId" | "name" | "mobileNo" | "lat" | "lng">) {
  try {
    const cur = getStopsSnapshot();
    const exists = cur.some((s) => s.stationId === stop.stationId);
    const next = exists
      ? cur.filter((s) => s.stationId !== stop.stationId)
      : [
          {
            stationId: stop.stationId,
            name: stop.name,
            mobileNo: stop.mobileNo,
            lat: stop.lat,
            lng: stop.lng,
          },
          ...cur,
        ].slice(0, MAX_SAVED_STOPS);
    localStorage.setItem(STOPS_KEY, JSON.stringify(next));
    emit();
  } catch {
    /* 사파리 사생활 보호 모드 등 저장 불가 환경에서는 조용히 무시 */
  }
}

export function removeSavedStop(stationId: string) {
  try {
    const cur = getStopsSnapshot();
    const next = cur.filter((s) => s.stationId !== stationId);
    localStorage.setItem(STOPS_KEY, JSON.stringify(next));
    emit();
  } catch {
    /* ignore */
  }
}

export function setHomeDong(dong: string | null) {
  try {
    if (dong) localStorage.setItem(DONG_KEY, dong);
    else localStorage.removeItem(DONG_KEY);
    emit();
  } catch {
    /* ignore */
  }
}
