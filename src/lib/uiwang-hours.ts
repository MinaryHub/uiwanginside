/**
 * 의왕시 안에서 영업시간이 적힌 곳 — OpenStreetMap
 * (© OpenStreetMap contributors, ODbL).
 *
 * 손으로 고치지 말 것. `npm run hours:fetch` 가 만든다.
 * 한국에는 개별 가게 영업시간을 주는 공식 오픈 API 가 없어, 자원봉사자가
 * 적어둔 것을 쓴다. 전체 가게 수에 비하면 적다 — 없는 곳이 훨씬 많다.
 *
 * 15곳
 */
export interface OsmHours {
  name: string;
  /** OSM opening_hours 원문. 표준 문법("Mo-Fr 09:00-18:00")과 자유 문장이 섞여 있다. */
  hours: string;
  lat: number;
  lng: number;
}

export const UIWANG_HOURS: OsmHours[] = [
  { name: "강남면옥 백운호수점", hours: "11:00-21:50", lat: 37.37416, lng: 127.005388 },
  { name: "롯데프리미엄아울렛의왕점", hours: "10:30~21:00", lat: 37.375959, lng: 127.009586 },
  { name: "세븐일레븐 의왕삼동중앙점", hours: "24/7", lat: 37.316597, lng: 126.952109 },
  { name: "소와주", hours: "11:00-23:00", lat: 37.31784, lng: 126.950087 },
  { name: "신협의왕시티병원점", hours: "평일 09:00~17:00", lat: 37.350208, lng: 126.976538 },
  { name: "오전동 꽃길공원", hours: "24/7", lat: 37.370011, lng: 126.965587 },
  { name: "의왕 테슬라 슈퍼차저", hours: "24/7", lat: 37.37585, lng: 127.009722 },
  { name: "의왕레일바이크 매표소", hours: "Mo-Fr 10:00-17:30; PH,Sa,Su 10:00-17:30", lat: 37.31005, lng: 126.950654 },
  { name: "의왕부곡우체국", hours: "Mo-Fr 09:00-18:00", lat: 37.319737, lng: 126.950713 },
  { name: "의왕시청어린이집", hours: "Mo-Fr 09:00-18:00", lat: 37.345514, lng: 126.96851 },
  { name: "의왕역공영주차장", hours: "24/7", lat: 37.322247, lng: 126.9494 },
  { name: "의왕철도산업홍보관", hours: "Tu-Su 09:00-17:00", lat: 37.321191, lng: 126.948494 },
  { name: "지구촌어린이집", hours: "Mo-Fr 09:00-18:00", lat: 37.354002, lng: 126.986295 },
  { name: "철도박물관", hours: "Mar-Oct 09:00-18:00 || Nov-Feb 09:00-17:00; Mo closed", lat: 37.313973, lng: 126.950623 },
  { name: "청화세차장", hours: "07:30-19:30", lat: 37.391737, lng: 126.981908 },
];
