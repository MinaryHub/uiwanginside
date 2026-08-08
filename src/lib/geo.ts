import { UIWANG_BOUNDARY } from "./uiwang-boundary";

/**
 * 좌표가 의왕시 행정경계 안에 있는지 판정한다 (ray casting).
 *
 * 서버와 클라이언트가 같은 함수를 쓴다. 클라이언트가 보낸
 * "저는 의왕시에 있습니다" 같은 불리언은 절대 신뢰하지 않고,
 * 서버가 좌표를 직접 받아 여기서 다시 판정한다.
 */
export function isInsideUiwang(lat: number, lng: number): boolean {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  const poly = UIWANG_BOUNDARY;
  let inside = false;
  for (let i = 0, n = poly.length; i < n; i++) {
    const [y1, x1] = poly[i];
    const [y2, x2] = poly[(i + 1) % n];
    if (y1 > lat !== y2 > lat && lng < ((x2 - x1) * (lat - y1)) / (y2 - y1) + x1) {
      inside = !inside;
    }
  }
  return inside;
}

/**
 * 위치 정확도 상한(m). 오차가 이보다 크면 의왕 안이라 단정할 수 없다.
 * Wi-Fi/기지국 기반 측위는 수 km 오차가 나므로 걸러낸다.
 */
export const MAX_ACCURACY_M = 3000;
