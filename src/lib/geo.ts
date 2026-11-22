import { UIWANG_BOUNDARY } from "./uiwang-boundary";
import { DONG_BOUNDARIES } from "./dong-boundaries";

/** 점이 다각형 내부에 있는지 판정한다 (ray casting) */
export function pointInRing(ring: [number, number][], lat: number, lng: number): boolean {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  let inside = false;
  for (let i = 0, n = ring.length; i < n; i++) {
    const [y1, x1] = ring[i];
    const [y2, x2] = ring[(i + 1) % n];
    if (y1 > lat !== y2 > lat && lng < ((x2 - x1) * (lat - y1)) / (y2 - y1) + x1) {
      inside = !inside;
    }
  }
  return inside;
}

/**
 * 좌표가 의왕시 행정경계 안에 있는지 판정한다 (ray casting).
 *
 * 서버와 클라이언트가 같은 함수를 쓴다. 클라이언트가 보낸
 * "저는 의왕시에 있습니다" 같은 불리언은 절대 신뢰하지 않고,
 * 서버가 좌표를 직접 받아 여기서 다시 판정한다.
 */
export function isInsideUiwang(lat: number, lng: number): boolean {
  return pointInRing(UIWANG_BOUNDARY, lat, lng);
}

/** 좌표가 속한 의왕시 행정동 이름 (없으면 null) */
export function dongFor(lat: number, lng: number): string | null {
  for (const [name, ring] of Object.entries(DONG_BOUNDARIES)) {
    if (pointInRing(ring, lat, lng)) return name;
  }
  return null;
}

/** 두 좌표 사이의 직선 거리 (m, Haversine) */
export function haversine(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371000;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((aLat * Math.PI) / 180) *
      Math.cos((bLat * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(s)));
}

/** 위도 37도 기준 평면 근사 거리 (m) */
export function flatMetres(aLat: number, aLng: number, bLat: number, bLng: number): number {
  return Math.hypot((aLat - bLat) * 111_000, (aLng - bLng) * 88_000);
}

/**
 * 위치 정확도 상한(m). 오차가 이보다 크면 의왕 안이라 단정할 수 없다.
 * Wi-Fi/기지국 기반 측위는 수 km 오차가 나므로 걸러낸다.
 */
export const MAX_ACCURACY_M = 3000;
