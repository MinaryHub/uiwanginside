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
  /** 초 단위 예정 시간 */
  predictSec: number | null;
  predictSec2: number | null;
  remainSeats: number | null;
  plateNo: string;
  lowPlate: boolean;
}

export interface BusStop {
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
  /** osm = 정류소 위치만 실제 데이터, 도착 예정 시간 없음 */
  source: "gbis" | "osm";
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

export interface ApiEnvelope<T> {
  /** false = 데이터를 가져오지 못했다. 이때 data 는 비어 있다. */
  ok: boolean;
  data: T;
  /** ok:false 인 이유. 화면에 그대로 노출한다. */
  notice?: string;
}
