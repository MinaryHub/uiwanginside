"use client";

/**
 * 기기 식별자.
 *
 * 로그인 없이 "한 기기가 한 가게에 한 번" 을 지키기 위한 값이다.
 * 지우거나 바꿀 수 있으니 완전한 방어는 아니고, 서버의 위치 검증과
 * 속도 제한을 함께 걸어 현실적인 상한을 만든다.
 */
const KEY = "uiwang-device-id";

export function getDeviceId(): string {
  if (typeof window === "undefined") return "";
  let id = localStorage.getItem(KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(KEY, id);
  }
  return id;
}
