import type { CategoryKey } from "./uiwang";
import type { WeatherAlert } from "./alerts";

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
  /**
   * 화면 안에 실제로 존재하는 곳의 수.
   * places 보다 클 수 있다 — 카카오가 한 번에 주는 양에 한도가 있어서다.
   * 얼마나 덜 보여주고 있는지 사용자에게 알리는 데 쓴다.
   */
  total?: number;
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
  /** 지금 의왕에 발효 중인 기상특보 */
  alerts: WeatherAlert[];
  source: "kma";
  updatedAt: string;
}

export type { WeatherAlert };

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

/**
 * 격자 칸 하나에서 잰 도로별 속도.
 * 좌표가 없는 ITS 소통정보를 지도에 올리기 위한 최소 단위다 —
 * "이 도로의 이 칸 언저리가 이 속도" 까지가 알 수 있는 전부다.
 */
export interface RoadSpeed {
  road: string;
  tile: number;
  /** 통행시간으로 가중한 공간평균속도 (km/h) */
  speed: number;
  /** 이 칸에서 집계에 쓰인 링크 수 */
  links: number;
}

export interface TrafficPayload {
  incidents: Incident[];
  links: TrafficLink[];
  /** 지도에 그릴 구간별 속도 */
  speeds: RoadSpeed[];
  source: "its";
  updatedAt: string;
}

/** OSM 에서 가져온 도로 한 조각의 형상 */
export interface RoadWay {
  name: string;
  /** 도시고속·고속도로 — 소통상태 기준이 다르다 */
  expressway: boolean;
  path: [number, number][];
}

export interface RoadsPayload {
  roads: RoadWay[];
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
  /** 혼잡도 1=여유 2=보통 3=혼잡 4=매우혼잡. GBIS 만 제공 */
  crowded?: number | null;
  remainSeats?: number | null;
  lowPlate?: boolean;
}

export interface BusPositionsPayload {
  routeId: string;
  routeName: string;
  positions: BusPosition[];
  /** 조회에 쓴 도시 (노선 소속). GBIS 경로에서는 비어 있다 */
  cityName: string;
  /** 위치를 어디서 얻었는지 */
  source: "gbis" | "tago";
  /** 운행 중이지만 좌표를 못 구한 대수 (수도권 밖 구간) */
  unresolved: number;
  updatedAt: string;
}

/** 여러 노선의 실시간 위치를 한 번에 */
export interface BusFleetPayload {
  routes: BusPositionsPayload[];
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
