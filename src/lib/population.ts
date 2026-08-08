/**
 * 의왕시 인구 통계 (정적 스냅샷).
 *
 * 인구는 월 단위로만 갱신되고 공공 API 는 모두 인증키가 필요해,
 * 검증된 수치를 저장소에 번들하고 기준 시점을 함께 노출한다.
 * 수치를 갱신할 때는 반드시 6개 동을 같은 기준월로 함께 교체할 것.
 * 시점이 섞이면 합계가 시 전체와 어긋난다.
 *
 * 출처
 * - 동별 인구: 행정안전부 주민등록인구통계 2026년 6월 기준
 * - 면적: 위키백과 의왕시 행정구역 표 (면적은 거의 변하지 않음)
 * - 세대수: 의왕시청 일반현황 (기준일이 달라 별도 표기)
 */

export interface DongPopulation {
  name: string;
  population: number;
  /** km² */
  area: number;
  /** 소속 법정동 */
  legalDongs: string[];
  lat: number;
  lng: number;
}

/** 동별 인구 기준 시점 — UI 에 반드시 함께 표시한다 */
export const POPULATION_AS_OF = "2026년 6월";

export const DONG_POPULATION: DongPopulation[] = [
  {
    name: "고천동",
    population: 17_719,
    area: 8.9,
    legalDongs: ["고천동", "왕곡동"],
    lat: 37.3435,
    lng: 126.9702,
  },
  {
    name: "부곡동",
    population: 28_551,
    area: 11.3,
    legalDongs: ["삼동", "월암동", "이동", "초평동"],
    lat: 37.3186,
    lng: 126.9575,
  },
  {
    name: "오전동",
    population: 32_595,
    area: 6.8,
    legalDongs: ["오전동"],
    lat: 37.3517,
    lng: 126.9642,
  },
  {
    name: "내손1동",
    population: 19_590,
    area: 2.55,
    legalDongs: ["내손동(일부)"],
    lat: 37.3742,
    lng: 126.9686,
  },
  {
    name: "내손2동",
    population: 28_131,
    area: 2.5,
    legalDongs: ["내손동(일부)", "포일동(일부)"],
    lat: 37.3801,
    lng: 126.9744,
  },
  {
    name: "청계동",
    population: 37_635,
    area: 22.08,
    legalDongs: ["내손동(일부)", "청계동", "포일동(일부)", "학의동"],
    lat: 37.3946,
    lng: 126.9986,
  },
];

/** 시 세대수 — 동별 인구와 기준일이 다르므로 따로 관리한다 */
export const HOUSEHOLDS = {
  count: 66_007,
  asOf: "2025년 12월",
  source: "의왕시청 일반현황",
} as const;

/** 의왕시 공식 면적 (km²) */
export const CITY_AREA = 53.99;

export const TOTAL_POPULATION = DONG_POPULATION.reduce(
  (sum, d) => sum + d.population,
  0,
);

/** 명/km² */
export function density(population: number, area: number) {
  return Math.round(population / area);
}
