"use client";

/**
 * 주소 복사 및 장소 공유(Web Share API + 클립보드 폴백).
 */

export async function copyText(text: string): Promise<boolean> {
  if (!text) return false;
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* 아래 임시 textarea 폴백으로 이어간다 */
  }

  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

export interface SharePayload {
  title: string;
  text?: string;
  lat: number;
  lng: number;
}

export function buildDeepLink(lat: number, lng: number): string {
  if (typeof window === "undefined") return "";
  const url = new URL(window.location.origin);
  url.searchParams.set("lat", lat.toFixed(5));
  url.searchParams.set("lng", lng.toFixed(5));
  url.searchParams.set("z", "2");
  return url.toString();
}

export async function shareLocation(payload: SharePayload): Promise<"shared" | "copied" | "failed"> {
  const url = buildDeepLink(payload.lat, payload.lng);
  const title = `${payload.title} · 의왕 인사이드`;
  const text = payload.text ? `${payload.title} (${payload.text})` : payload.title;

  try {
    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      await navigator.share({ title, text, url });
      return "shared";
    }
  } catch (e) {
    // 사용자가 공유 시트를 취소한 경우 실패로 취급하지 않고 조용히 종료
    if (e instanceof Error && e.name === "AbortError") return "shared";
  }

  const copied = await copyText(payload.text ? `${payload.title}\n${payload.text}\n${url}` : `${payload.title}\n${url}`);
  return copied ? "copied" : "failed";
}
