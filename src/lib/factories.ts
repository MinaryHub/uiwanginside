import { UIWANG_FACTORIES, FACTORIES_AS_OF } from "./uiwang-factories";
import type { FactoryItem } from "./types";

/**
 * 제조업 분포.
 *
 * 원본 업종명은 한국표준산업분류 이름 그대로라 백 가지가 넘고 길다
 * ("금속 가공제품 제조업; 기계 및 가구 제외"). 시민이 한눈에 볼 수 있게
 * 열네 묶음으로 모은다. 순서가 중요하다 — 위에서부터 처음 맞는 것을 쓴다.
 *   - "비금속 광물" 에도 '금속' 이 들어 있어 비금속을 먼저 본다
 *   - "금속가공제품; 기계 및 가구 제외" 에 '기계'·'가구' 가 들어 있어
 *     금속을 기계·가구보다 먼저 본다
 *   - "전자부품 … 통신장비", "기타 운송장비" 에 '장비' 가 들어 있어
 *     전자·운송을 기계보다 먼저 본다
 *   - "의료용 물질 및 의약품" 은 화학이다. 의료·정밀보다 먼저 본다
 */
export interface IndustryGroup {
  id: string;
  label: string;
  emoji: string;
  color: string;
  match: RegExp;
}

export const INDUSTRY_GROUPS: IndustryGroup[] = [
  { id: "food", label: "식품·음료", emoji: "🍞", color: "#f59f00", match: /식료품|음료|담배/ },
  { id: "textile", label: "섬유·의류", emoji: "🧵", color: "#e64980", match: /섬유|의복|가죽|가방|신발/ },
  { id: "paper", label: "목재·종이·인쇄", emoji: "📄", color: "#a9744f", match: /목재|나무|종이|펄프|인쇄|기록매체/ },
  { id: "chem", label: "화학·의약", emoji: "🧪", color: "#7048e8", match: /화학|의약|의료용 물질|비누|세제|화장품|도료|접착/ },
  { id: "rubber", label: "고무·플라스틱", emoji: "🧴", color: "#15aabf", match: /고무|플라스틱/ },
  { id: "mineral", label: "유리·시멘트", emoji: "🧱", color: "#868e96", match: /비금속|유리|시멘트|콘크리트|도자기|석재/ },
  { id: "metal", label: "금속", emoji: "🔩", color: "#495057", match: /금속|철강|주조/ },
  { id: "electronic", label: "전자·통신", emoji: "💾", color: "#1c7ed6", match: /전자|반도체|컴퓨터|영상|음향|통신/ },
  { id: "electric", label: "전기장비", emoji: "🔌", color: "#fab005", match: /전기장비|전동기|발전기|변압기|전지|축전지|조명|절연선|케이블/ },
  { id: "precision", label: "의료·정밀", emoji: "🔬", color: "#12b886", match: /의료|정밀|광학|측정|시계/ },
  { id: "vehicle", label: "자동차·운송", emoji: "🚗", color: "#e03131", match: /자동차|트레일러|운송장비|철도|선박|항공/ },
  { id: "machine", label: "기계·장비", emoji: "⚙️", color: "#364fc7", match: /기계|장비/ },
  { id: "furniture", label: "가구", emoji: "🪑", color: "#d9480f", match: /가구/ },
  { id: "etc", label: "기타 제조", emoji: "🏭", color: "#5c5f66", match: /./ },
];

const GROUP_MAP = Object.fromEntries(INDUSTRY_GROUPS.map((g) => [g.id, g]));

export function industryGroup(industry: string): IndustryGroup {
  return INDUSTRY_GROUPS.find((g) => g.match.test(industry)) ?? GROUP_MAP.etc;
}

export interface Tally {
  key: string;
  label: string;
  count: number;
  employees: number;
}

function tally(list: FactoryItem[], keyOf: (f: FactoryItem) => string): Tally[] {
  const m = new Map<string, Tally>();
  for (const f of list) {
    const k = keyOf(f);
    if (!k) continue;
    const t = m.get(k) ?? { key: k, label: k, count: 0, employees: 0 };
    t.count += 1;
    t.employees += f.employees ?? 0;
    m.set(k, t);
  }
  return [...m.values()].sort((a, b) => b.count - a.count || b.employees - a.employees);
}

export interface FactorySummary {
  asOf: string | null;
  total: number;
  employees: number;
  byGroup: Tally[];
  byDong: Tally[];
  largest: FactoryItem[];
}

export function summarizeFactories(list: FactoryItem[], asOf: string | null): FactorySummary {
  return {
    asOf,
    total: list.length,
    employees: list.reduce((n, f) => n + (f.employees ?? 0), 0),
    byGroup: tally(list, (f) => industryGroup(f.industry).id).map((t) => ({
      ...t,
      label: GROUP_MAP[t.key].label,
    })),
    byDong: tally(list, (f) => f.dong),
    /** 종업원이 많은 곳 — 우리 동네 큰 일터 */
    largest: [...list]
      .filter((f) => f.employees != null && f.employees > 0)
      .sort((a, b) => (b.employees ?? 0) - (a.employees ?? 0))
      .slice(0, 8),
  };
}

/** 정적 스냅샷 요약 */
export const FACTORY_SUMMARY = summarizeFactories(UIWANG_FACTORIES, FACTORIES_AS_OF);

export { GROUP_MAP as INDUSTRY_GROUP_MAP };
