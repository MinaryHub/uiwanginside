"use client";

import { useEffect, useRef, useState } from "react";

/**
 * 값이 delay 동안 안정될 때까지 갱신을 미룬다.
 *
 * 반경 슬라이더나 지도 드래그는 조작 도중 값이 연속으로 바뀌는데,
 * 그 값이 그대로 SWR 키가 되면 중간값마다 요청이 나간다.
 * (슬라이더 0.5→10km 한 번 = 요청 20회, 카카오 호출 수백 건)
 */
export function useDebounced<T>(value: T, delay = 400): T {
  const [debounced, setDebounced] = useState(value);
  const first = useRef(true);

  useEffect(() => {
    // 최초 값은 지연 없이 통과시켜 초기 로딩을 늦추지 않는다
    if (first.current) {
      first.current = false;
      return;
    }
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);

  return debounced;
}
