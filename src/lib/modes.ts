import type { CategoryKey } from "./uiwang";

/**
 * 목적별 모드.
 *
 * 시민은 "전부" 가 아니라 "지금 필요한 것" 을 찾으러 온다. 목적을 고르면
 * 지도 레이어와 시트 내용이 함께 정해진다.
 *
 * 예전에는 지도 위 모드 넷과, 요약줄에서 여는 탭 창(뉴스·날씨·미세먼지·
 * 사고·진료·쓰레기·인구), 동 고르기 메뉴가 따로 있었다. 들어가는 길이
 * 여러 갈래라 어디에 무엇이 있는지 외워야 했다. 지금은 하단 메뉴 한 줄이
 * 전부다. 아무것도 고르지 않은 상태가 '둘러보기' 다.
 */

/**
 * 하단 메뉴 하나하나가 곧 모드다. 메뉴는 한 단계뿐이다 — 누르면 바로 내용이
 * 나오고, 그 안에 또 고를 탭이나 하위 메뉴를 두지 않는다.
 */
export type ModeId =
  | "weather"
  | "medical"
  | "transit"
  | "food"
  | "life"
  | "waste"
  | "dong"
  | "news";

/** 시트에 띄울 내용 */
export type CardId =
  | "emergency"
  | "industry"
  | "compare"
  | "weather"
  | "air"
  | "shelter"
  | "medical"
  | "traffic"
  | "cctv"
  | "transit"
  | "ev"
  | "libraries"
  | "waste"
  | "population"
  | "notices"
  | "news";

export interface MapLayers {
  places: boolean;
  bus: boolean;
  incidents: boolean;
  traffic: boolean;
  /** 도로 CCTV — 모두 고속도로 위라 교통 모드에서만 의미가 있다 */
  cctv: boolean;
}

export interface ModeDef {
  id: ModeId;
  label: string;
  /** 메뉴 그림. 글자를 못 읽어도 알아볼 수 있어야 한다 */
  icon: string;
  /** 메뉴 칸 바탕색 — 메뉴마다 다르게 해 위치로도 기억되게 한다 */
  tint: string;
  /** 시트 상단 한 줄 설명 */
  hint: string;
  categories: CategoryKey[];
  /**
   * categories 를 목록으로도 보일지. 기본은 보인다.
   * 우리 동네처럼 지도에 점만 찍고 내용은 통계로 보여줄 때 끈다.
   */
  list?: boolean;
  layers: MapLayers;
  cards: CardId[];
}

const NO_LAYERS: MapLayers = {
  places: false,
  bus: false,
  incidents: false,
  traffic: false,
  cctv: false,
};

export const MODES: ModeDef[] = [
  {
    id: "weather",
    label: "날씨·공기",
    icon: "☀️",
    tint: "#ffe27a",
    hint: "지금 날씨 · 공기 · 무더위·한파 쉼터",
    categories: [],
    layers: NO_LAYERS,
    // 첫 화면 공기 배지를 누르고 들어온 사람이 바로 보게 공기가 먼저
    cards: ["air", "weather", "shelter"],
  },
  {
    id: "medical",
    label: "병원·약국",
    icon: "🏥",
    tint: "#ffb3b3",
    hint: "응급실 병상 · 지금 문 연 병원·약국",
    categories: ["HP8", "PM9"],
    layers: { ...NO_LAYERS, places: true },
    // 급한 사람이 먼저 봐야 할 것이 위로 온다
    cards: ["emergency", "medical"],
  },
  {
    id: "transit",
    label: "버스·교통",
    icon: "🚌",
    tint: "#a8d8ff",
    hint: "버스 도착 · 사고·정체 · CCTV · 전기차 충전",
    // 주차장은 카카오(PK6) 대신 표준데이터(PKG)를 쓴다 — 요금과 운영시간이 있다
    categories: ["SW8", "PKG"],
    layers: { places: true, bus: true, incidents: true, traffic: true, cctv: true },
    cards: ["transit", "traffic", "ev", "cctv"],
  },
  {
    id: "food",
    label: "맛집",
    icon: "🍜",
    tint: "#ffc98a",
    hint: "음식점 · 카페",
    categories: ["FD6", "CE7"],
    layers: { ...NO_LAYERS, places: true },
    cards: [],
  },
  {
    id: "life",
    label: "생활",
    icon: "🛒",
    tint: "#b8efc0",
    hint: "마트 · 편의점 · 학교 · 도서관 · 공원 · 화장실",
    categories: ["MT1", "CS2", "BK9", "OL7", "SC4", "PO3", "CT1", "PARK", "WC", "SEC"],
    layers: { ...NO_LAYERS, places: true },
    cards: ["libraries"],
  },
  {
    id: "waste",
    label: "쓰레기",
    icon: "♻️",
    tint: "#c9f0e4",
    hint: "버리는 날과 버리는 법",
    categories: [],
    layers: NO_LAYERS,
    cards: ["waste"],
  },
  {
    id: "dong",
    label: "우리 동네",
    icon: "🏘️",
    tint: "#d9c8ff",
    hint: "동별 인구 · 생활 인프라 비교 · 제조업 분포",
    // 공장은 지도에 점으로만. 수백 곳을 목록으로 늘어놓으면 통계가 묻힌다
    categories: ["MFG"],
    list: false,
    layers: { ...NO_LAYERS, places: true },
    cards: ["population", "compare", "industry"],
  },
  {
    id: "news",
    label: "소식",
    icon: "📰",
    tint: "#ffd1ec",
    hint: "의왕시 공지·행사 · 지역 최신 뉴스",
    categories: [],
    layers: NO_LAYERS,
    cards: ["notices", "news"],
  },
];

export const MODE_MAP = Object.fromEntries(MODES.map((m) => [m.id, m])) as Record<
  ModeId,
  ModeDef
>;

export function isModeId(v: string | null): v is ModeId {
  return v !== null && v in MODE_MAP;
}
