"use client";

import { useCallback, useState } from "react";
import { useMyLocation } from "./useMyLocation";
import { getDeviceId } from "./deviceId";
import type { Place, PlaceRating } from "./types";

/**
 * 별점 등록 흐름.
 *
 * 지도 위 상세 카드와 우측 패널이 같은 로직을 쓰도록 분리했다.
 * 위치 확인 → 전송 → 결과 메시지까지를 한 곳에서 관리한다.
 */
export function useRating(onDone: (placeId: string, rating: PlaceRating) => void) {
  const { state, request } = useMyLocation();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const canRate = state.status === "ok" && state.inUiwang;

  const submit = useCallback(
    async (place: Place, stars: number, comment?: string) => {
      if (state.status !== "ok") return false;
      setBusy(true);
      setMessage(null);
      try {
        const res = await fetch("/api/ratings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            placeId: place.id,
            placeName: place.name,
            stars,
            comment: comment?.trim() || undefined,
            deviceId: getDeviceId(),
            lat: state.lat,
            lng: state.lng,
            accuracy: state.accuracy,
          }),
        });
        const json = (await res.json()) as {
          ok?: boolean;
          message?: string;
          avg?: number;
          count?: number;
          mine?: number;
        };
        if (!res.ok || !json.ok) {
          setMessage(json.message ?? "평가를 저장하지 못했습니다.");
          return false;
        }
        setMessage("평가가 반영되었습니다.");
        // 서버가 방금 계산한 집계를 그대로 쓴다.
        // 재조회를 기다리면 그 사이 별이 빈 상태로 되돌아간다.
        onDone(place.id, {
          avg: json.avg ?? stars,
          count: json.count ?? 1,
          mine: json.mine ?? stars,
        });
        return true;
      } catch {
        setMessage("네트워크 오류로 저장하지 못했습니다.");
        return false;
      } finally {
        setBusy(false);
      }
    },
    [state, onDone],
  );

  return { state, request, canRate, busy, message, setMessage, submit };
}
