/** 화면 전반에서 공통으로 쓰는 표시 형식 헬퍼 */

/** 미터 단위 거리를 읽기 쉽게 바꾼다 (예: 320m, 1.4km) */
export function formatDistance(m: number | null | undefined): string | null {
  if (m == null || !Number.isFinite(m)) return null;
  return m >= 1000 ? `${(m / 1000).toFixed(1)}km` : `${Math.round(m)}m`;
}

/** 기상청 하늘/강수 상태 → 아이콘 */
export const SKY_ICON: Record<string, string> = {
  맑음: "☀️",
  구름많음: "⛅",
  흐림: "☁️",
};

export const PTY_ICON: Record<string, string> = {
  비: "🌧️",
  "비/눈": "🌨️",
  눈: "❄️",
  소나기: "🌦️",
  빗방울: "💧",
  "빗방울/눈날림": "🌨️",
  눈날림: "❄️",
};

export function weatherIcon(sky: string, pty: string): string {
  if (pty && pty !== "없음") return PTY_ICON[pty] ?? "🌧️";
  return SKY_ICON[sky] ?? "🌤️";
}

/** 버스 도착 예정 초 → 표시 문자열 */
export function formatBusEta(sec: number | null): string {
  if (sec == null) return "정보 없음";
  if (sec < 90) return "곧 도착";
  return `${Math.round(sec / 60)}분`;
}

/** GBIS 혼잡도 (1=여유, 2=보통, 3=혼잡, 4=매우혼잡) */
export const BUS_CROWD: Record<number, { label: string; color: string }> = {
  1: { label: "여유", color: "var(--ok)" },
  2: { label: "보통", color: "var(--info)" },
  3: { label: "혼잡", color: "var(--warn)" },
  4: { label: "매우혼잡", color: "var(--danger)" },
};
