/**
 * 의왕시 생활쓰레기 배출 규정.
 *
 * 출처: 의왕시청 「생활쓰레기」 안내 (uiwang.go.kr/UWKORENV0301)
 *
 * ⚠️ 동별 수거 요일은 의왕시가 공개하지 않는다. 공식 안내에도
 * "자세한 수거 일정은 자원관리과에 문의" 로만 되어 있다.
 * 요일을 추정해 넣으면 시민이 잘못된 날에 배출하게 되므로 넣지 않는다.
 * 추후 시에서 요일표를 공개하면 여기에 추가할 것.
 */

export interface WasteKind {
  id: string;
  label: string;
  emoji: string;
  color: string;
  /** 담는 방법 */
  container: string;
  /** 배출 시 주의사항 */
  notes: string[];
}

export const DISCHARGE_WINDOW = {
  /** 배출 가능 시각 */
  from: "수거 전날 20:00",
  to: "수거일 06:00",
  label: "전날 저녁 8시 ~ 당일 오전 6시",
} as const;

export const COLLECTION_TIME = {
  normal: "06:00 ~ 15:00",
  summer: "05:00 ~ 14:00",
} as const;

export const WASTE_KINDS: WasteKind[] = [
  {
    id: "general",
    label: "일반쓰레기",
    emoji: "🗑️",
    color: "#64748b",
    container: "유백색 일반 종량제봉투",
    notes: [
      "단독주택은 내 집 앞, 공동주택은 지정 장소에 배출",
      "재활용 가능한 품목은 반드시 분리",
    ],
  },
  {
    id: "food",
    label: "음식물쓰레기",
    emoji: "🍚",
    color: "#f59e0b",
    container: "노란색 음식물 종량제봉투 또는 전용 수거용기",
    notes: [
      "물기와 이물질을 제거한 뒤 배출",
      "뼈·조개껍데기·달걀껍데기는 음식물이 아닌 일반쓰레기",
    ],
  },
  {
    id: "recycle",
    label: "재활용품",
    emoji: "♻️",
    color: "#16a34a",
    container: "품목별로 묶거나 투명봉투에 담아 배출",
    notes: [
      "종이·플라스틱·캔·병·비닐을 품목별로 분리",
      "내용물을 비우고 헹군 뒤 라벨 제거",
    ],
  },
  {
    id: "bulky",
    label: "대형폐기물",
    emoji: "🛋️",
    color: "#7c3aed",
    container: "신고 후 신고필증(스티커) 부착",
    notes: [
      "온라인 신청 후 스티커를 붙여 지정 장소에 배출",
      "배출은 오후 8시 이후",
    ],
  },
];

export const WASTE_CONTACT = {
  dept: "의왕시청 자원관리과",
  phone: "031-345-2841",
  bulkyUrl: "https://www.uiwang.go.kr/UWKORENV0312",
  guideUrl: "https://www.uiwang.go.kr/UWKORENV0301",
} as const;

/**
 * 동별 수거 요일 미공개 안내.
 * 이 값이 false 로 바뀌는 날 = 시가 요일표를 공개한 날.
 */
export const HAS_DONG_SCHEDULE = false;
