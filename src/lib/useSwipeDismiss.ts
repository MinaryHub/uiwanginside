"use client";

import { useRef, useState } from "react";
import type { TouchEvent } from "react";

/**
 * 모바일 하단 카드/시트의 아래 스와이프 닫기 제스처.
 *
 * 핸들이나 헤더 영역에 handlers 를 붙이면, 아래로 끌어내릴 때 실시간으로
 * 따라 내려오고 threshold(px) 이상 내리면 onDismiss 를 부른다.
 */
export function useSwipeDismiss(onDismiss: () => void, threshold = 64) {
  const startY = useRef<number | null>(null);
  const [dragY, setDragY] = useState(0);

  const onTouchStart = (e: TouchEvent) => {
    if (e.touches.length !== 1) return;
    startY.current = e.touches[0].clientY;
    setDragY(0);
  };

  const onTouchMove = (e: TouchEvent) => {
    if (startY.current === null || e.touches.length !== 1) return;
    const dy = e.touches[0].clientY - startY.current;
    if (dy > 0) setDragY(dy);
  };

  const onTouchEnd = () => {
    if (startY.current === null) return;
    const moved = dragY;
    startY.current = null;
    setDragY(0);
    if (moved >= threshold) onDismiss();
  };

  return {
    dragY,
    dragging: dragY > 0,
    handlers: {
      onTouchStart,
      onTouchMove,
      onTouchEnd,
      onTouchCancel: onTouchEnd,
    },
  };
}
