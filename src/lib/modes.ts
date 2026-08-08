import type { CategoryKey } from "./uiwang";

/**
 * 목적별 모드.
 *
 * 이전에는 카테고리 11종, 지도 레이어 5종, 우측 카드 8개가 동시에 켜져 있어
 * 화면이 무엇을 말하려는지 알 수 없었다. 시민은 "전부"가 아니라 "지금 필요한 것"을
 * 찾으러 오므로, 목적을 고르면 지도 레이어와 카드 구성이 함께 정해지도록 한다.
 */

export type ModeId = "explore" | "life" | "medical" | "transit" | "edu";

/** 우측에 띄울 카드 */
export type CardId =
  | "weather"
  | "air"
  | "medical"
  | "traffic"
  | "transit"
  | "waste"
  | "population"
  | "news";

export interface MapLayers {
  places: boolean;
  bus: boolean;
  incidents: boolean;
  traffic: boolean;
}

export interface ModeDef {
  id: ModeId;
  label: string;
  emoji: string;
  /** 탭 아래 한 줄 설명 */
  hint: string;
  categories: CategoryKey[];
  layers: MapLayers;
  cards: CardId[];
  /** 기본 지도 확대 수준 */
  level: number;
}

const NO_LAYERS: MapLayers = {
  places: false,
  bus: false,
  incidents: false,
  traffic: false,
};

export const MODES: ModeDef[] = [
  {
    id: "explore",
    label: "둘러보기",
    emoji: "🗾",
    hint: "의왕시 전체를 한눈에",
    categories: [],
    layers: NO_LAYERS,
    cards: ["population", "news"],
    level: 7,
  },
  {
    id: "life",
    label: "생활",
    emoji: "🛒",
    hint: "마트·편의점·은행·주유소",
    categories: ["MT1", "CS2", "BK9", "OL7"],
    layers: { ...NO_LAYERS, places: true },
    cards: ["waste", "weather", "news"],
    level: 5,
  },
  {
    id: "medical",
    label: "의료",
    emoji: "🏥",
    hint: "지금 진료 중인 병원·약국",
    categories: ["HP8", "PM9"],
    layers: { ...NO_LAYERS, places: true },
    cards: ["medical", "air"],
    level: 5,
  },
  {
    id: "transit",
    label: "교통",
    emoji: "🚌",
    hint: "버스 도착·사고·정체",
    categories: ["SW8", "PK6"],
    layers: { places: true, bus: true, incidents: true, traffic: true },
    cards: ["transit", "traffic"],
    level: 5,
  },
  {
    id: "edu",
    label: "교육·문화",
    emoji: "🏫",
    hint: "학교·도서관·공공기관",
    categories: ["SC4", "CT1", "PO3"],
    layers: { ...NO_LAYERS, places: true },
    cards: ["population", "news"],
    level: 5,
  },
];

export const MODE_MAP = Object.fromEntries(MODES.map((m) => [m.id, m])) as Record<
  ModeId,
  ModeDef
>;

export function isModeId(v: string | null): v is ModeId {
  return v !== null && v in MODE_MAP;
}
