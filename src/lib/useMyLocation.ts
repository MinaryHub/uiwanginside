"use client";

import { useCallback, useState } from "react";
import { isInsideUiwang, MAX_ACCURACY_M } from "./geo";

export type LocationState =
  | { status: "idle" }
  | { status: "asking" }
  | { status: "denied"; message: string }
  | { status: "error"; message: string }
  | { status: "ok"; lat: number; lng: number; accuracy: number; inUiwang: boolean };

/**
 * 브라우저 위치를 한 번 가져온다.
 *
 * 자동으로 요청하지 않는다 — 위치 권한 팝업이 방문 즉시 뜨면 대부분 거부하고,
 * 그러면 다시 물어보기 어렵다. 평가하려는 순간에만 요청한다.
 */
export function useMyLocation() {
  const [state, setState] = useState<LocationState>({ status: "idle" });

  /**
   * onDone 은 결과가 나온 뒤 한 번 불린다.
   * 위치를 받아 지도를 옮기는 것 같은 일은 렌더의 결과가 아니라 누른
   * 행동의 결과다. state 를 보고 effect 에서 처리하면 언제 몇 번 도는지
   * 알기 어려워지므로, 끝난 자리에서 바로 알린다.
   */
  const request = useCallback((onDone?: (s: LocationState) => void) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      const next: LocationState = {
        status: "error",
        message: "이 브라우저는 위치 기능을 지원하지 않습니다.",
      };
      setState(next);
      onDone?.(next);
      return;
    }
    setState({ status: "asking" });
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude, accuracy } = pos.coords;
        const next: LocationState = {
          status: "ok",
          lat: latitude,
          lng: longitude,
          accuracy,
          // 오차가 크면 의왕 안이라고 단정하지 않는다
          inUiwang: accuracy <= MAX_ACCURACY_M && isInsideUiwang(latitude, longitude),
        };
        setState(next);
        onDone?.(next);
      },
      (err) => {
        let next: LocationState;
        if (err.code === err.PERMISSION_DENIED) {
          next = {
            status: "denied",
            message: "위치 권한이 거부되었습니다. 브라우저 설정에서 허용해 주세요.",
          };
        } else {
          next = {
            status: "error",
            message:
              err.code === err.TIMEOUT
                ? "위치 확인이 지연되고 있습니다. 다시 시도해 주세요."
                : "위치를 확인할 수 없습니다.",
          };
        }
        setState(next);
        onDone?.(next);
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
    );
  }, []);

  return { state, request };
}
