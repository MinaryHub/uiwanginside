import type { CategoryKey } from "./uiwang";

export interface Place {
  id: string;
  name: string;
  category: CategoryKey;
  categoryName: string;
  phone: string;
  address: string;
  roadAddress: string;
  lat: number;
  lng: number;
  distance: number | null;
  url: string;
}

/** 모두 실제 데이터 출처다. 샘플/가짜 데이터는 표시하지 않는다. */
export type PlaceSource = "kakao" | "osm";

export interface PlacesPayload {
  places: Place[];
  source: PlaceSource;
}

export interface WeatherNow {
  temp: number | null;
  humidity: number | null;
  rain1h: number | null;
  windSpeed: number | null;
  /** 강수형태 코드 해석 */
  precipitation: string;
  sky: string;
  observedAt: string;
}

export interface WeatherForecastItem {
  time: string;
  temp: number | null;
  sky: string;
  precipitation: string;
  pop: number | null;
}

export interface WeatherPayload {
  now: WeatherNow | null;
  forecast: WeatherForecastItem[];
  source: "kma";
  updatedAt: string;
}

export interface NewsItem {
  title: string;
  link: string;
  description: string;
  publishedAt: string;
  source: string;
}

export interface NewsPayload {
  items: NewsItem[];
  source: "naver";
  updatedAt: string;
}

export type IncidentKind = "accident" | "construction" | "closure" | "weather" | "etc";

export interface Incident {
  id: string;
  kind: IncidentKind;
  type: string;
  message: string;
  road: string;
  lat: number | null;
  lng: number | null;
  startedAt: string;
}

export interface TrafficLink {
  id: string;
  name: string;
  speed: number;
  /** 원활 / 서행 / 정체 */
  level: "smooth" | "slow" | "congested";
  lat: number | null;
  lng: number | null;
}

export interface TrafficPayload {
  incidents: Incident[];
  links: TrafficLink[];
  source: "its";
  updatedAt: string;
}

export interface BusArrival {
  routeId: string;
  routeName: string;
  /** 종점 방향 — 같은 노선의 상·하행을 구분해준다 */
  destName: string;
  /** 초 단위 예정 시간 */
  predictSec: number | null;
  predictSec2: number | null;
  remainSeats: number | null;
  /** 혼잡도 0=정보없음 1=여유 2=보통 3=혼잡 4=매우혼잡 */
  crowded: number | null;
  /** 남은 정류소 수 */
  stationsLeft: number | null;
  plateNo: string;
  lowPlate: boolean;
}

export interface BusStop {
  /** 정류소 번호(ARS) — 표지판에 적힌 숫자 */
  stationId: string;
  mobileNo: string;
  name: string;
  lat: number;
  lng: number;
  distance: number | null;
  arrivals?: BusArrival[];
}

export interface TransitPayload {
  stops: BusStop[];
  /** gbis = 실시간 도착정보 · osm = 위치만 (도착시간 없음) */
  source: "gbis" | "osm";
  updatedAt: string;
}

export interface BusPosition {
  vehicleNo: string;
  /** 현재(또는 직전) 정류소 */
  nodeName: string;
  nodeOrder: number | null;
  lat: number;
  lng: number;
}

export interface BusPositionsPayload {
  routeId: string;
  routeName: string;
  positions: BusPosition[];
  /** 조회에 쓴 도시 (노선 소속) */
  cityName: string;
  updatedAt: string;
}

export type AirGrade = "좋음" | "보통" | "나쁨" | "매우나쁨";

export interface AirStation {
  name: string;
  pm10: number | null;
  pm25: number | null;
  o3: number | null;
  no2: number | null;
  pm10Grade: AirGrade | null;
  pm25Grade: AirGrade | null;
  /** 통합대기환경지수 */
  khai: number | null;
  khaiGrade: AirGrade | null;
  measuredAt: string;
}

export interface AirPayload {
  stations: AirStation[];
  source: "airkorea";
  updatedAt: string;
}

export interface MedicalPlace {
  id: string;
  kind: "hospital" | "pharmacy";
  name: string;
  address: string;
  phone: string;
  lat: number | null;
  lng: number | null;
  category: string;
  /** 오늘 진료 시작/종료 (HH:MM). 정보 없으면 빈 문자열 */
  todayStart: string;
  todayClose: string;
  /** 지금 진료 중인지. 시간 정보가 없으면 null */
  openNow: boolean | null;
}

export interface MedicalPayload {
  places: MedicalPlace[];
  /** 1=월 … 7=일 */
  day: number;
  source: "nmc";
  updatedAt: string;
}

export interface PlaceRating {
  /** 평균 별점 (1~5) */
  avg: number;
  /** 평가 수 */
  count: number;
  /** 이 기기가 남긴 별점. 없으면 null */
  mine: number | null;
}

export interface RatingsPayload {
  /** placeId → 집계 */
  ratings: Record<string, PlaceRating>;
  updatedAt: string;
}

export interface ApiEnvelope<T> {
  /** false = 데이터를 가져오지 못했다. 이때 data 는 비어 있다. */
  ok: boolean;
  data: T;
  /** ok:false 인 이유. 화면에 그대로 노출한다. */
  notice?: string;
}
