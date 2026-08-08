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

export type PlaceSource = "kakao" | "osm" | "sample";

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
  source: "kma" | "sample";
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
  source: "naver" | "sample";
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
  source: "its" | "sample";
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
  source: "gbis" | "osm" | "sample";
  updatedAt: string;
}

export interface ApiEnvelope<T> {
  ok: boolean;
  data: T;
  /** 키 미설정 등으로 샘플 데이터를 반환한 경우 안내 메시지 */
  notice?: string;
}
