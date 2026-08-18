/** 의왕시 기본 지리 정보 */

export const UIWANG = {
  name: "의왕시",
  /** 의왕시청 (경기 의왕시 시청로 11) */
  center: { lat: 37.3448, lng: 126.9683 },
  /** 기상청 동네예보 격자 좌표 */
  grid: { nx: 60, ny: 122 },
  /**
   * ITS 돌발/소통정보 조회 범위.
   * 실제 행정경계 bbox(uiwang-boundary.ts)에 약 0.01도 여유를 둔 값이다.
   * 이전에 쓰던 maxX 127.03 은 실제 동쪽 끝(127.047)보다 좁아 청계동 일대가 빠졌다.
   */
  bbox: { minX: 126.919, maxX: 127.057, minY: 37.29, maxY: 37.426 },
  /** 지도 기본 반경(m) */
  defaultRadius: 4000,
} as const;

/**
 * 의왕시 행정동.
 * 좌표·인구·면적의 단일 출처는 population.ts 의 DONG_POPULATION 이다.
 * 두 곳에 좌표를 두면 반드시 어긋나므로 여기서는 다시 내보내기만 한다.
 */
export { DONG_POPULATION as DONGS } from "./population";

/**
 * 주요 랜드마크.
 * 좌표는 OSM/Nominatim 기준이며 행정경계 내부에 있음을 확인했다.
 * (초기 추정 좌표는 왕송호수·철도박물관이 경계 밖으로 벗어나 있었다)
 */
export const LANDMARKS: { name: string; lat: number; lng: number; desc: string }[] = [
  { name: "왕송호수", lat: 37.3179, lng: 126.9458, desc: "레일바이크·자연학습공원" },
  { name: "철도박물관", lat: 37.314, lng: 126.9508, desc: "국내 유일 철도 전문 박물관" },
  { name: "백운호수", lat: 37.3795, lng: 127.0024, desc: "카페거리·둘레길" },
  { name: "모락산", lat: 37.3705, lng: 126.9786, desc: "해발 385m 도심 등산로" },
  { name: "의왕시청", lat: 37.3448, lng: 126.9683, desc: "행정 중심" },
];

/** 카카오 로컬 카테고리 그룹 코드 */
export type CategoryKey =
  | "FD6"
  | "CE7"
  | "SC4"
  | "HP8"
  | "PM9"
  | "MT1"
  | "CS2"
  | "BK9"
  | "PK6"
  | "OL7"
  | "SW8"
  | "PO3"
  | "CT1"
  /**
   * 행정안전부 표준데이터에서 온 것들. 카카오에는 없거나 있어도
   * 요금·개방시간이 빠져 있어 따로 둔다.
   */
  | "PARK"
  | "PKG"
  | "WC"
  /** 분류가 없는 곳 — 호수·공원처럼 카카오 카테고리에 안 잡히는 것들 */
  | "ETC";

export interface CategoryDef {
  code: CategoryKey;
  label: string;
  emoji: string;
  /** 마커/뱃지 색 (tailwind 미사용, 인라인 스타일용 hex) */
  color: string;
}

export const CATEGORIES: CategoryDef[] = [
  { code: "FD6", label: "음식점", emoji: "🍽️", color: "#e11d48" },
  { code: "CE7", label: "카페", emoji: "☕", color: "#a16207" },
  { code: "SC4", label: "학교", emoji: "🏫", color: "#2563eb" },
  { code: "HP8", label: "병원", emoji: "🏥", color: "#dc2626" },
  { code: "PM9", label: "약국", emoji: "💊", color: "#16a34a" },
  { code: "MT1", label: "마트", emoji: "🛒", color: "#ea580c" },
  { code: "CS2", label: "편의점", emoji: "🏪", color: "#0891b2" },
  { code: "BK9", label: "은행", emoji: "🏦", color: "#7c3aed" },
  { code: "PK6", label: "주차장", emoji: "🅿️", color: "#475569" },
  { code: "OL7", label: "주유소", emoji: "⛽", color: "#b45309" },
  { code: "SW8", label: "지하철역", emoji: "🚇", color: "#0d9488" },
  { code: "PO3", label: "공공기관", emoji: "🏛️", color: "#4f46e5" },
  { code: "CT1", label: "문화시설", emoji: "🎭", color: "#db2777" },
  { code: "PARK", label: "공원", emoji: "🌳", color: "#15803d" },
  { code: "PKG", label: "주차장", emoji: "🅿️", color: "#334155" },
  { code: "WC", label: "화장실", emoji: "🚻", color: "#0369a1" },
  { code: "ETC", label: "장소", emoji: "📍", color: "#475569" },
];

export const CATEGORY_MAP = Object.fromEntries(
  CATEGORIES.map((c) => [c.code, c]),
) as Record<CategoryKey, CategoryDef>;
