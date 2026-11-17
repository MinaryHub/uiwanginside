import type { AirGrade, AirStation } from "./types";

/**
 * 공기 등급 — 화면 어디서나 같은 얼굴, 같은 색, 같은 말로 보여준다.
 *
 * 숫자(㎍/㎥)를 보고 좋은지 나쁜지 아는 사람은 드물다. 얼굴과 한마디가
 * 먼저 오고 숫자는 그 아래다. 색만으로 말하지 않는다 — 낱말을 함께 쓴다.
 */
export const GRADE_ORDER: AirGrade[] = ["좋음", "보통", "나쁨", "매우나쁨"];

export const AIR_STYLE: Record<
  AirGrade,
  { emoji: string; color: string; tint: string; say: string }
> = {
  좋음: { emoji: "😊", color: "#1c7ed6", tint: "#d0ebff", say: "창문 열고 산책하기 좋아요" },
  보통: { emoji: "🙂", color: "#2b8a3e", tint: "#d3f9d8", say: "바깥 활동에 무리 없어요" },
  나쁨: { emoji: "😷", color: "#c76a00", tint: "#ffe8cc", say: "마스크를 챙기세요" },
  매우나쁨: { emoji: "🤢", color: "#e03131", tint: "#ffe3e3", say: "바깥 활동을 줄이세요" },
};

/** 둘 중 더 나쁜 쪽. 하나가 없으면 있는 쪽 */
export function worse(a: AirGrade | null, b: AirGrade | null): AirGrade | null {
  if (!a) return b;
  if (!b) return a;
  return GRADE_ORDER.indexOf(a) >= GRADE_ORDER.indexOf(b) ? a : b;
}

/**
 * 의왕의 지금 공기 — 측정소들의 미세·초미세 가운데 가장 나쁜 등급.
 *
 * 평균을 내지 않는다. 청계동이 나쁜데 고천동이 좋아 "보통" 이라고 하면
 * 청계동 사람은 마스크 없이 나간다. 조심하는 쪽으로 말한다.
 */
export function overallGrade(stations: AirStation[]): AirGrade | null {
  let g: AirGrade | null = null;
  for (const s of stations) g = worse(g, worse(s.pm10Grade, s.pm25Grade));
  return g;
}
