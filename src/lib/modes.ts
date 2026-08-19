import type { CategoryKey } from "./uiwang";

/**
 * 목적별 모드.
 *
 * 시민은 "전부" 가 아니라 "지금 필요한 것" 을 찾으러 온다. 목적을 고르면
 * 지도 레이어와 시트 내용이 함께 정해진다.
 *
 * 넷으로 줄였다. 예전에는 여섯이었는데 '둘러보기' 는 아무것도 고르지 않은
 * 기본 상태로 두는 게 자연스럽고(모드를 해제하면 그게 둘러보기다),
 * '교육·문화' 는 학교·도서관·공공기관이라 생활 범주에 넣어도 어색하지 않다.
 * 고를 것이 적을수록 무엇을 고를지 고민하는 시간이 준다.
 */

export type ModeId = "food" | "life" | "medical" | "transit";

/** 시트에 띄울 내용 */
export type CardId =
  | "rating"
  | "weather"
  | "air"
  | "medical"
  | "traffic"
  | "cctv"
  | "transit"
  | "waste"
  | "population"
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
  /** 시트 상단 한 줄 설명 */
  hint: string;
  categories: CategoryKey[];
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
    id: "food",
    label: "맛집",
    hint: "음식점·카페 — 시민이 매긴 별점",
    categories: ["FD6", "CE7"],
    layers: { ...NO_LAYERS, places: true },
    cards: ["rating"],
  },
  {
    id: "life",
    label: "생활",
    hint: "마트·편의점·은행·학교·공원·화장실",
    categories: ["MT1", "CS2", "BK9", "OL7", "SC4", "PO3", "CT1", "PARK", "WC"],
    layers: { ...NO_LAYERS, places: true },
    // 뉴스는 상단 요약줄에서 바로 열린다 — 여기 두면 또 목록 아래에 묻힌다
    cards: ["waste", "weather", "population"],
  },
  {
    id: "medical",
    label: "의료",
    hint: "지금 진료 중인 병원·약국",
    categories: ["HP8", "PM9"],
    layers: { ...NO_LAYERS, places: true },
    cards: ["medical", "air"],
  },
  {
    id: "transit",
    label: "교통",
    hint: "버스·정체·CCTV·주차장",
    // 주차장은 카카오(PK6) 대신 표준데이터(PKG)를 쓴다 — 요금과 운영시간이 있다
    categories: ["SW8", "PKG"],
    layers: { places: true, bus: true, incidents: true, traffic: true, cctv: true },
    cards: ["transit", "traffic", "cctv"],
  },
];

export const MODE_MAP = Object.fromEntries(MODES.map((m) => [m.id, m])) as Record<
  ModeId,
  ModeDef
>;

export function isModeId(v: string | null): v is ModeId {
  return v !== null && v in MODE_MAP;
}
