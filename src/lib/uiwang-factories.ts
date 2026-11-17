/**
 * 의왕시 등록 공장 — 경기도 의왕시_공장 현황 (공공데이터포털 파일데이터, 연 1회 갱신).
 *
 * 손으로 고치지 말 것. `npm run factories:fetch -- <내려받은 CSV>` 가 만든다.
 * 원본에는 좌표가 없어 주소를 카카오로 변환했고, 행정동은 그 좌표가 어느
 * 동 경계 안에 드는지로 정했다.
 *
 * 아직 자료를 받지 않았다 — 비어 있으면 화면은 "준비 중" 으로 안내한다.
 */

export interface Factory {
  name: string;
  /** 원본 업종명 (한국표준산업분류). 여럿이면 첫째 */
  industry: string;
  /** 종업원 수. 원본에 없으면 null */
  employees: number | null;
  /** 생산품 */
  product: string;
  address: string;
  /** 행정동 — DONG_BOUNDARIES 이름과 같다 */
  dong: string;
  lat: number;
  lng: number;
}

/** 원본 자료의 기준일. 자료가 없으면 null */
export const FACTORIES_AS_OF: string | null = null;

export const UIWANG_FACTORIES: Factory[] = [];
