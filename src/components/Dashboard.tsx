"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type TouchEvent } from "react";
import { useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import useSWR from "swr";
import { swrFetcher } from "@/lib/fetcher";
import { useDebounced } from "@/lib/useDebounced";
import { parseUrlState, useSyncUrl } from "@/lib/urlState";
import { LANDMARKS } from "@/lib/uiwang";
import { UIWANG_BBOX } from "@/lib/uiwang-boundary";
import { DONG_BBOX, type LatLngBox } from "@/lib/dong-boundaries";
import { MODES, MODE_MAP, type ModeId, type CardId } from "@/lib/modes";
import type { CategoryKey } from "@/lib/uiwang";
import type { LatLng } from "@/lib/busPath";
import { pickFleet, EMPTY_FLEET } from "@/lib/busFleet";
import { playArrivalChime, type BusAlertTarget, type FiredBusAlert } from "@/lib/busAlert";
import { useMyLocation } from "@/lib/useMyLocation";
import {
  buildSegments,
  LEVEL_COLOR,
  LEVEL_LABEL,
  type TrafficSegment,
} from "@/lib/traffic";
import { FACTORY_SUMMARY, industryGroup, summarizeFactories } from "@/lib/factories";
import { formatDistance } from "@/lib/format";
import type { Cctv, CctvPayload } from "@/lib/cctvTypes";
import { timeAgo } from "@/components/ui";
import type { LandmarkItem } from "@/components/KakaoMap";
import type {
  ApiEnvelope,
  Place,
  BusStop,
  Incident,
  MedicalPlace,
  EmergencyRoom,
  FactoryItem,
  FactoriesPayload,
  EvStation,
  EvChargersPayload,
  ShelterItem,
  SheltersPayload,
  LibraryItem,
  LibrariesPayload,
  NoticesPayload,
  SubwayPayload,
  LocalCurrencyMerchant,
  LocalCurrencyPayload,
  PlacesPayload,
  WeatherPayload,
  AirPayload,
  MedicalPayload,
  EmergencyPayload,
  NewsPayload,
  TrafficPayload,
  TransitPayload,
  BusPositionsPayload,
  BusFleetPayload,
  RoadsPayload,
} from "@/lib/types";
import {
  useSavedStops,
  useHomeDong,
  toggleSavedStop,
  removeSavedStop,
  setHomeDong,
  type SavedStop,
} from "@/lib/preferences";
import Link from "next/link";
import Logo from "@/components/Logo";
import Icon from "@/components/Icon";
import { AIR_STYLE, overallGrade } from "@/lib/air";
import SummaryStrip, { type InfoTab } from "@/components/SummaryStrip";
import PlaceDetailCard from "@/components/PlaceDetailCard";
import StopCard from "@/components/StopCard";
import CctvCard from "@/components/CctvCard";
import SearchOverlay from "@/components/SearchOverlay";
import DongCard from "@/components/DongCard";
import MapCard from "@/components/MapCard";
import InstallHint from "@/components/InstallHint";
import PlacesPanel from "@/components/panels/PlacesPanel";
import WeatherPanel from "@/components/panels/WeatherPanel";
import AirPanel from "@/components/panels/AirPanel";
import MedicalPanel from "@/components/panels/MedicalPanel";
import EmergencyPanel from "@/components/panels/EmergencyPanel";
import TrafficPanel from "@/components/panels/TrafficPanel";
import TransitPanel from "@/components/panels/TransitPanel";
import CctvPanel from "@/components/panels/CctvPanel";
import NewsPanel from "@/components/panels/NewsPanel";
import WastePanel from "@/components/panels/WastePanel";
import PopulationPanel from "@/components/panels/PopulationPanel";
import IndustryPanel from "@/components/panels/IndustryPanel";
import EvChargersPanel from "@/components/panels/EvChargersPanel";
import ShelterPanel from "@/components/panels/ShelterPanel";
import LibrariesPanel from "@/components/panels/LibrariesPanel";
import NoticesPanel from "@/components/panels/NoticesPanel";
import DongComparePanel from "@/components/panels/DongComparePanel";
import SubwayPanel from "@/components/panels/SubwayPanel";
import LocalCurrencyPanel from "@/components/panels/LocalCurrencyPanel";

const KakaoMap = dynamic(() => import("@/components/KakaoMap"), { ssr: false });

/**
 * 빈 값은 모듈 상수로 고정한다.
 * JSX 안에서 [] 나 {} 를 쓰면 렌더마다 새 참조가 만들어져, 지도의
 * 마커 effect 가 매번 다시 돌고 전체 마커가 지워졌다 다시 그려진다.
 * 15초마다 오는 버스 위치 갱신이 화면 전체를 깜빡이게 만든 원인이었다.
 */
const NO_PLACES: Place[] = [];
const NO_INCIDENTS: Incident[] = [];
const NO_STOPS: BusStop[] = [];
const NO_MEDICAL: MedicalPayload["places"] = [];
const NO_EMERGENCY: EmergencyRoom[] = [];
const NO_LANDMARKS: typeof LANDMARKS = [];
const NO_SEGMENTS: TrafficSegment[] = [];
const NO_CCTVS: Cctv[] = [];
const NO_BUSES: BusPositionsPayload[] = [];
const NO_PATHS: Record<string, LatLng[]> = {};
const NO_EV: EvStation[] = [];
const NO_SHELTERS: ShelterItem[] = [];
const NO_LIBRARIES: LibraryItem[] = [];

/** CDN 캐시 히트율을 높이기 위해 좌표를 약 200m 격자로 맞춘다 */
const snapCoord = (v: number) => (Math.round(v * 500) / 500).toFixed(3);
const roundRect = (rect: string) =>
  rect
    .split(",")
    .map((v) => {
      const n = Number(v);
      return Number.isFinite(n) ? n.toFixed(3) : v;
    })
    .join(",");

const POLL = {
  weather: 10 * 60_000,
  air: 10 * 60_000,
  medical: 10 * 60_000,
  // 응급실 병상·교통 소통은 기관 갱신 주기에 맞춰 여유 있게 조회한다
  emergency: 90_000,
  traffic: 90_000,
  transit: 30_000,
  news: 5 * 60_000,
  // GBIS 는 16초에 한 번만 새 값을 준다. 동시 접속 여유를 두고 20초로 맞춘다.
  busPositions: 20_000,
};

/**
 * 지도가 화면이고 나머지는 그 위에 뜬다.
 *
 * 이전에는 헤더·모드탭·좌패널·지도·우패널이 화면을 나눠 가져 지도가 3분의 1
 * 남짓이었다. 지도 중심 포털에서 지도를 양쪽에서 누르고 있었던 셈이다.
 * 지금은 지도가 전면이고 상단 바·모드 알약·시트가 그 위에 떠 있다.
 */
export default function Dashboard({ appKey }: { appKey?: string }) {
  const initial = parseUrlState(useSearchParams());

  /** null = 둘러보기. 지도만 보이는 기본 상태다. */
  const [mode, setMode] = useState<ModeId | null>(initial.mode);
  const [center, setCenter] = useState({ lat: initial.lat, lng: initial.lng });
  const [level, setLevel] = useState(initial.level);
  const [fitBounds, setFitBounds] = useState<LatLngBox | null>(() =>
    initial.dong && DONG_BBOX[initial.dong] ? { ...DONG_BBOX[initial.dong] } : null,
  );
  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(null);
  /**
   * 지도에서 고른 정류소·사고·CCTV·응급실·랜드마크. 장소 선택과 상호 배타다 —
   * 카드가 두 개 겹쳐 뜨면 어느 것을 보고 있는지 알 수 없다.
   */
  const [marker, setMarker] = useState<
    | { kind: "stop"; stop: BusStop }
    | { kind: "incident"; incident: Incident }
    | { kind: "cctv"; cctv: Cctv }
    | { kind: "emergency"; room: EmergencyRoom }
    | { kind: "landmark"; landmark: LandmarkItem }
    | { kind: "ev"; station: EvStation }
    | { kind: "shelter"; shelter: ShelterItem }
    | { kind: "library"; library: LibraryItem }
    | { kind: "currency"; merchant: LocalCurrencyMerchant }
    | null
  >(null);
  const [activeDong, setActiveDong] = useState<string | null>(initial.dong);
  const savedStops = useSavedStops();
  const homeDong = useHomeDong();
  const [tracked, setTracked] = useState<{ id: string; name: string } | null>(null);
  /** 클라이언트 전용 버스 도착 알림 (설정된 정류소·노선이 임계 시간 이하로 오면 울린다) */
  const [busAlert, setBusAlert] = useState<BusAlertTarget | null>(null);
  const busAlertRef = useRef<BusAlertTarget | null>(null);
  useEffect(() => {
    busAlertRef.current = busAlert;
  }, [busAlert]);
  const [firedAlert, setFiredAlert] = useState<FiredBusAlert | null>(null);
  const [newsQuery, setNewsQuery] = useState("의왕시");
  const [sheetOpen, setSheetOpen] = useState(!!initial.mode);
  /** 모바일 바텀시트 높이: 기본 'half' 로 지도와 목록을 함께 보고, 스와이프/탭으로 'full' 확장 */
  const [sheetSnap, setSheetSnap] = useState<"half" | "full">("half");
  const [sheetDragY, setSheetDragY] = useState(0);
  const sheetTouchStartY = useRef<number | null>(null);

  const onSheetTouchStart = useCallback((e: TouchEvent) => {
    if (e.touches.length !== 1) return;
    sheetTouchStartY.current = e.touches[0].clientY;
    setSheetDragY(0);
  }, []);

  const onSheetTouchMove = useCallback((e: TouchEvent) => {
    if (sheetTouchStartY.current === null || e.touches.length !== 1) return;
    const dy = e.touches[0].clientY - sheetTouchStartY.current;
    // 위로는 최대 -90px, 아래로는 최대 220px 까지만 부드럽게 따라오게 제한
    setSheetDragY(Math.max(-90, Math.min(220, dy)));
  }, []);

  const onSheetTouchEnd = useCallback(() => {
    if (sheetTouchStartY.current === null) return;
    const dy = sheetDragY;
    sheetTouchStartY.current = null;
    setSheetDragY(0);
    if (sheetSnap === "half") {
      if (dy <= -45) setSheetSnap("full");
      else if (dy >= 64) setSheetOpen(false);
    } else {
      if (dy >= 160) {
        setSheetOpen(false);
        setSheetSnap("half");
      } else if (dy >= 55) {
        setSheetSnap("half");
      }
    }
  }, [sheetDragY, sheetSnap]);
  /**
   * 좁히기 — 모드 안에서 한 종류만 볼 때.
   * 지도와 목록이 함께 좁혀져야 해서 여기서 들고 있는다.
   */
  const [only, setOnly] = useState<CategoryKey | null>(initial.only);
  /** 우리 동네 모드에서 업종 막대를 눌러 지도 공장 핀을 좁힐 때 */
  const [industryFilter, setIndustryFilter] = useState<string | null>(null);
  /** 상단 요약줄에서 날씨와 공기 중 어느 쪽을 눌러 열었는지 */
  const [summaryWeatherTab, setSummaryWeatherTab] = useState<"weather" | "air">("weather");
  const [searchOpen, setSearchOpen] = useState(false);
  /** 검색·병원·공장 목록에서 고른 곳 — 지금 목록에 없어도 지도와 카드에 남는다 */
  const [pinned, setPinned] = useState<Place | null>(null);

  const def = mode ? MODE_MAP[mode] : null;

  const dCenter = useDebounced(center, 500);
  const geo = `lat=${snapCoord(dCenter.lat)}&lng=${snapCoord(dCenter.lng)}`;

  /**
   * 장소 조회에 쓰는 화면 범위.
   *
   * 지도를 움직일 때마다 다시 조회하면 마커가 계속 바뀌어 눈이 따라가지
   * 못한다. 그래서 "충분히 움직였을 때" 만 갱신한다 — 확대 수준이 바뀌거나,
   * 새 화면이 이전에 조회한 범위를 절반 이상 벗어났을 때다.
   * 살짝 끌어보는 정도로는 화면이 그대로 있다.
   */
  const [searchArea, setSearchArea] = useState<{
    rect: string;
    lat: number;
    lng: number;
  } | null>(null);
  const areaRef = useRef<{ rect: string; level: number } | null>(null);
  /** 마지막으로 지도가 알려준 화면 범위. 갱신 여부와 무관하게 늘 최신이다. */
  const lastViewRef = useRef<{ rect: string; lat: number; lng: number } | null>(null);

  const onBoundsChanged = useCallback(
    (rect: string, c: { lat: number; lng: number }, lv: number) => {
      // 손가락으로 벌려 확대하면 지도만 바뀌고 상태는 그대로였다.
      // 이름표를 붙일지 정하는 기준과 주소창이 옛 값을 보고 있었다.
      setLevel(lv);

      lastViewRef.current = { rect, lat: c.lat, lng: c.lng };

      const prev = areaRef.current;
      let refresh = !prev;

      if (prev) {
        const [aMinX, aMinY, aMaxX, aMaxY] = prev.rect.split(",").map(Number);
        const [bMinX, bMinY, bMaxX, bMaxY] = rect.split(",").map(Number);
        const w = bMaxX - bMinX;
        const h = bMaxY - bMinY;

        /*
         * 확대 수준이 한 칸 바뀔 때마다 다시 조회하고 있었다. 새 결과는
         * 범위가 달라 목록이 통째로 갈리고, 그러면 지도 마커도 함께
         * 갈린다 — 손가락을 벌릴 때마다 배지가 사라졌다 나타난 이유다.
         *
         * 확대는 그 자체로 새 자료를 부르지 않는다. 화면이 넓어져 이전에
         * 훑은 범위를 벗어났을 때만 다시 찾는다. 좁히는 쪽은 이미 가진
         * 것으로 충분하다.
         */
        const grew = w > (aMaxX - aMinX) * 1.6 || h > (aMaxY - aMinY) * 1.6;

        // 가로·세로 어느 쪽으로든 화면의 절반을 넘게 움직였으면 새로 찾는다
        const movedX = Math.abs((bMinX + bMaxX) / 2 - (aMinX + aMaxX) / 2);
        const movedY = Math.abs((bMinY + bMaxY) / 2 - (aMinY + aMaxY) / 2);
        refresh = grew || movedX > w * 0.5 || movedY > h * 0.5;
      }

      if (refresh) {
        areaRef.current = { rect, level: lv };
        setSearchArea({ rect, lat: c.lat, lng: c.lng });
      }
    },
    [],
  );

  /** 조금만 움직였을 때 스스로 갱신하지 않으므로, 직접 누를 수 있게 한다 */
  const searchHere = useCallback(() => {
    const v = lastViewRef.current;
    if (!v) return;
    areaRef.current = { rect: v.rect, level };
    setSearchArea({ rect: v.rect, lat: v.lat, lng: v.lng });
  }, [level]);

  const urlState = useMemo(
    () => ({ mode, lat: center.lat, lng: center.lng, level, dong: activeDong, only }),
    [mode, center.lat, center.lng, level, activeDong, only],
  );
  useSyncUrl(urlState);

  // ── 데이터 ────────────────────────────────────────────
  const needs = (c: CardId) => !!def?.cards.includes(c);

  const places = useSWR<ApiEnvelope<PlacesPayload>>(
    def?.categories.length && searchArea
      ? `/api/places?categories=${[...def.categories].sort().join(",")}` +
          `&rect=${roundRect(searchArea.rect)}&lat=${searchArea.lat.toFixed(3)}` +
          `&lng=${searchArea.lng.toFixed(3)}`
      : null,
    swrFetcher,
    {
      keepPreviousData: true,
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      dedupingInterval: 60_000,
    },
  );
  const weather = useSWR<ApiEnvelope<WeatherPayload>>("/api/weather", swrFetcher, {
    refreshInterval: POLL.weather,
    keepPreviousData: true,
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    dedupingInterval: 5 * 60_000,
  });
  const air = useSWR<ApiEnvelope<AirPayload>>("/api/air", swrFetcher, {
    refreshInterval: POLL.air,
    keepPreviousData: true,
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    dedupingInterval: 5 * 60_000,
  });
  const traffic = useSWR<ApiEnvelope<TrafficPayload>>("/api/traffic", swrFetcher, {
    refreshInterval: POLL.traffic,
    keepPreviousData: true,
    focusThrottleInterval: 60_000,
    dedupingInterval: 45_000,
  });
  const medical = useSWR<ApiEnvelope<MedicalPayload>>("/api/medical", swrFetcher, {
    refreshInterval: POLL.medical,
    keepPreviousData: true,
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    dedupingInterval: 5 * 60_000,
  });
  const emergency = useSWR<ApiEnvelope<EmergencyPayload>>(
    needs("emergency") ? "/api/emergency" : null,
    swrFetcher,
    {
      refreshInterval: POLL.emergency,
      keepPreviousData: true,
      focusThrottleInterval: 60_000,
      dedupingInterval: 45_000,
    },
  );
  const transit = useSWR<ApiEnvelope<TransitPayload>>(
    def?.layers.bus || needs("transit") || !!busAlert ? `/api/transit?${geo}` : null,
    swrFetcher,
    {
      refreshInterval: busAlert ? 15_000 : POLL.transit,
      keepPreviousData: true,
      focusThrottleInterval: 20_000,
      dedupingInterval: 15_000,
      onSuccess(env) {
        const alert = busAlertRef.current;
        if (!alert || !env?.ok) return;
        const stop = env.data.stops.find((s) => s.stationId === alert.stationId);
        const arr = stop?.arrivals?.find((a) => a.routeId === alert.routeId);
        if (arr?.predictSec != null && arr.predictSec <= alert.thresholdSec) {
          playArrivalChime();
          setFiredAlert({
            stationName: alert.stationName,
            routeName: alert.routeName,
            predictSec: arr.predictSec,
          });
          setBusAlert(null);
        }
      },
    },
  );
  /*
   * 뉴스는 모드와 무관하게 받는다. 상단 요약줄에 최신 제목을 띄우기
   * 때문이다. 예전에는 생활 모드에서만 받았고, 그 카드가 장소 목록
   * 아래에 있어 사실상 아무도 보지 못했다.
   */
  const news = useSWR<ApiEnvelope<NewsPayload>>(
    `/api/news?q=${encodeURIComponent(newsQuery)}`,
    swrFetcher,
    {
      refreshInterval: POLL.news,
      keepPreviousData: true,
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      dedupingInterval: 3 * 60_000,
    },
  );
  const factories = useSWR<ApiEnvelope<FactoriesPayload>>(
    needs("industry") || needs("compare") || activeDong ? "/api/factories" : null,
    swrFetcher,
    { revalidateOnFocus: false, revalidateOnReconnect: false, dedupingInterval: 30 * 60_000 },
  );
  const evChargers = useSWR<ApiEnvelope<EvChargersPayload>>(
    needs("ev") || needs("compare") ? "/api/ev-chargers" : null,
    swrFetcher,
    {
      refreshInterval: 3 * 60_000,
      keepPreviousData: true,
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      dedupingInterval: 2 * 60_000,
    },
  );
  const shelters = useSWR<ApiEnvelope<SheltersPayload>>(
    needs("shelter") ? "/api/shelters" : null,
    swrFetcher,
    { revalidateOnFocus: false, revalidateOnReconnect: false, dedupingInterval: 60 * 60_000 },
  );
  const libraries = useSWR<ApiEnvelope<LibrariesPayload>>(
    needs("libraries") ? "/api/libraries" : null,
    swrFetcher,
    { revalidateOnFocus: false, revalidateOnReconnect: false, dedupingInterval: 60 * 60_000 },
  );
  const notices = useSWR<ApiEnvelope<NoticesPayload>>(
    needs("notices") ? "/api/notices" : null,
    swrFetcher,
    {
      refreshInterval: POLL.news,
      keepPreviousData: true,
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      dedupingInterval: 3 * 60_000,
    },
  );
  const subway = useSWR<ApiEnvelope<SubwayPayload>>(
    needs("subway") ? "/api/subway" : null,
    swrFetcher,
    {
      refreshInterval: 30_000,
      keepPreviousData: true,
      focusThrottleInterval: 20_000,
      dedupingInterval: 15_000,
    },
  );
  const localCurrency = useSWR<ApiEnvelope<LocalCurrencyPayload>>(
    needs("currency") ? "/api/local-currency" : null,
    swrFetcher,
    { revalidateOnFocus: false, revalidateOnReconnect: false, dedupingInterval: 60 * 60_000 },
  );

  const dongFactoryCounts = useMemo(() => {
    const summary =
      factories.data?.ok && factories.data.data.factories.length > 0
        ? summarizeFactories(factories.data.data.factories, factories.data.data.asOf)
        : FACTORY_SUMMARY;
    return Object.fromEntries(summary.byDong.map((t) => [t.key, t.count])) as Record<string, number>;
  }, [factories.data]);

  const placeList = useMemo(() => places.data?.data.places ?? [], [places.data]);

  /**
   * 근처에 곧 오는 노선들 — 후보.
   *
   * 예전에는 노선 하나를 골라야만 버스가 보였다. 정류소를 눌러 노선을
   * 좇기 전에는 지도에 버스가 한 대도 없었다. 근처 정류소의 도착 예정에서
   * 노선을 모아 함께 띄운다.
   *
   * 여기서는 자르지 않는다. 무엇을 띄울지는 아래에서 정한다.
   */
  const busCandidates = useMemo(() => {
    if (!def?.layers.bus || tracked) return "";
    const seen = new Map<string, { name: string; sec: number }>();
    for (const s of transit.data?.data.stops ?? []) {
      for (const a of s.arrivals ?? []) {
        if (a.predictSec == null) continue;
        const cur = seen.get(a.routeId);
        if (!cur || a.predictSec < cur.sec) {
          seen.set(a.routeId, { name: a.routeName, sec: a.predictSec });
        }
      }
    }
    return [...seen.entries()]
      .sort((a, b) => a[1].sec - b[1].sec)
      .map(([id, v]) => `${id}:${v.name}`)
      .join(",");
  }, [def?.layers.bus, tracked, transit.data]);

  /** 지금 지도에 띄우고 있는 노선. 쉽게 바뀌지 않는다 */
  const [picked, setPicked] = useState({ at: "", fleet: EMPTY_FLEET });

  // 노선 순서가 달라져도 같은 CDN URL 로 묶이도록 ID 순으로 정렬한다
  const fleetKey = [...picked.fleet.routes]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((r) => `${r.id}:${encodeURIComponent(r.name)}`)
    .join(",");

  const busFleet = useSWR<ApiEnvelope<BusFleetPayload>>(
    fleetKey ? `/api/bus-positions?routes=${fleetKey}` : null,
    swrFetcher,
    {
      refreshInterval: POLL.busPositions,
      keepPreviousData: true,
      focusThrottleInterval: 20_000,
      dedupingInterval: 15_000,
    },
  );

  /*
   * 후보나 응답이 바뀌었을 때만 다시 고른다.
   *
   * 렌더 중에 상태를 고치는 것은 React 가 인정하는 방식이다 — 이전
   * 선택을 알아야 다음 선택을 정할 수 있고, 이 계산은 화면에 그리기
   * 전에 끝나야 한다. 효과로 미루면 한 번 잘못된 노선으로 조회한다.
   */
  const answered = busFleet.data?.ok ? busFleet.data.data.routes : null;
  const pickAt = `${busCandidates}|${busFleet.data?.data.updatedAt ?? ""}`;
  if (picked.at !== pickAt) {
    setPicked({ at: pickAt, fleet: pickFleet(picked.fleet, busCandidates, answered) });
  }

  const busPositions = useSWR<ApiEnvelope<BusPositionsPayload>>(
    tracked
      ? `/api/bus-positions?routeId=${tracked.id}&routeName=${encodeURIComponent(tracked.name)}`
      : null,
    swrFetcher,
    {
      refreshInterval: POLL.busPositions,
      keepPreviousData: true,
      focusThrottleInterval: 20_000,
      dedupingInterval: 15_000,
    },
  );

  // ── 동작 ──────────────────────────────────────────────
  /**
   * 한 지점을 화면 가운데로.
   *
   * 전에는 중심과 확대 수준을 따로 걸었다. 지도에서는 이것이 이동
   * 애니메이션(panTo)과 확대 애니메이션(setLevel) 두 개로 나뉘어 같은
   * 순간에 시작되고, 서로를 끊어 엉뚱한 자리에 멈추곤 했다. 검색으로
   * 고른 곳이 화면 밖에 남는 것도 이 때문이었다.
   *
   * setBounds 는 중심과 확대 수준을 한 번에 정한다. 동 경계를 맞출 때
   * 쓰던 길과 같다 — 그쪽은 처음부터 문제가 없었다.
   *
   * 세 번째 값은 확대 수준이 아니라 "가운데에서 몇 미터까지 보일지" 다.
   * 지도가 알아서 그에 맞는 확대 수준을 고른다.
   */
  const focus = useCallback((lat: number, lng: number, spanM = 400) => {
    const dLat = spanM / 111_000;
    // 위도 37도에서 경도 1도는 약 88km
    const dLng = spanM / 88_000;
    setFitBounds({
      minLat: lat - dLat,
      maxLat: lat + dLat,
      minLng: lng - dLng,
      maxLng: lng + dLng,
    });
  }, []);

  /**
   * 휴대폰에서는 시트가 화면을 다 덮는다.
   * 목록에서 무엇을 고르면 상세 카드가 시트 뒤에 깔려 보이지 않았다.
   * 고르는 순간 시트를 접어 지도와 카드를 드러낸다 — 손잡이로 다시 연다.
   */
  const revealMap = useCallback(() => {
    if (typeof window !== "undefined" && window.innerWidth < 640) setSheetOpen(false);
  }, []);

  /** 같은 모드를 다시 누르면 해제되어 둘러보기로 돌아간다 */
  const toggleMode = useCallback((next: ModeId) => {
    setMode((cur) => {
      const off = cur === next;
      setSheetOpen(!off);
      setSheetSnap("half");
      setSelectedPlaceId(null);
      setMarker(null);
      setTracked(null);
      // 모드가 바뀌면 좁히기를 푼다 — 이전 모드의 종류는 여기 없다
      setOnly(null);
      setIndustryFilter(null);
      return off ? null : next;
    });
  }, []);

  const toggleDong = useCallback(
    (d: { name: string }) => {
      setActiveDong((cur) => {
        if (cur === d.name) {
          setFitBounds(null);
          return null;
        }
        const box = DONG_BBOX[d.name];
        if (box) setFitBounds({ ...box });
        revealMap();
        return d.name;
      });
    },
    [revealMap],
  );

  /**
   * 내 위치로.
   *
   * 의왕 밖이면 지도를 옮기지 않는다 — 의왕 포털에서 화면이 수원이나
   * 서울로 날아가면 돌아올 길을 스스로 찾아야 한다. 대신 그 사실을
   * 알리고 시청을 보여준다.
   */
  const myLocation = useMyLocation();
  const [locNotice, setLocNotice] = useState<string | null>(null);

  const goToMe = useCallback(() => {
    setLocNotice(null);
    myLocation.request((s) => {
      if (s.status !== "ok") {
        setLocNotice(s.status === "asking" ? null : (s as { message?: string }).message ?? null);
        return;
      }
      if (s.inUiwang) {
        focus(s.lat, s.lng, 350);
      } else {
        setLocNotice("의왕시 밖에 계십니다. 의왕 전체를 보여드립니다.");
        setFitBounds({ ...UIWANG_BBOX });
      }
    });
  }, [myLocation, focus]);

  const me = myLocation.state.status === "ok" ? myLocation.state : null;

  /**
   * 검색에서 고른 곳.
   *
   * 그 장소는 지금 보고 있는 목록에 없을 수 있다 (다른 모드이거나 화면
   * 밖이거나). 따로 들고 있다가 지도와 상세 카드에 얹는다.
   */
  const pickSearched = useCallback(
    (p: Place) => {
      setPinned(p);
      setMarker(null);
      setSelectedPlaceId(p.id);
      focus(p.lat, p.lng, 250);
      setSheetOpen(false);
    },
    [focus],
  );

  const handleSelectPlace = useCallback(
    (p: Place) => {
      setMarker(null);
      setSelectedPlaceId((id) => {
        if (id === p.id) return null;
        focus(p.lat, p.lng, 350);
        revealMap();
        return p.id;
      });
    },
    [revealMap, focus],
  );

  const selectMedical = useCallback(
    (m: MedicalPlace) => {
      if (m.lat == null || m.lng == null) return;
      const pid = `med:${m.id}`;
      setMarker(null);
      setSelectedPlaceId((cur) => {
        if (cur === pid) return null;
        const synthetic: Place = {
          id: pid,
          name: m.name,
          category: m.kind === "pharmacy" ? "PM9" : "HP8",
          categoryName: m.category || (m.kind === "pharmacy" ? "약국" : "병·의원"),
          phone: m.phone,
          address: m.address,
          roadAddress: m.address,
          lat: m.lat!,
          lng: m.lng!,
          distance: null,
          url: "",
        };
        setPinned(synthetic);
        focus(m.lat!, m.lng!, 250);
        revealMap();
        return pid;
      });
    },
    [focus, revealMap],
  );

  const selectFactory = useCallback(
    (f: FactoryItem) => {
      if (f.lat == null || f.lng == null) return;
      const existing = placeList.find(
        (p) => p.category === "MFG" && p.name === f.name,
      );
      if (existing) {
        handleSelectPlace(existing);
        return;
      }
      const pid = `fac:live:${f.name}`;
      const detail = [
        f.industry,
        f.employees ? `종업원 ${f.employees.toLocaleString("ko-KR")}명` : "",
        f.product,
      ]
        .filter(Boolean)
        .join(" · ");
      const synthetic: Place = {
        id: pid,
        name: f.name,
        category: "MFG",
        categoryName: detail || "공장",
        phone: "",
        address: f.address,
        roadAddress: f.address,
        lat: f.lat,
        lng: f.lng,
        distance: null,
        url: "",
      };
      setPinned(synthetic);
      setMarker(null);
      setSelectedPlaceId(pid);
      focus(f.lat, f.lng, 300);
      revealMap();
    },
    [placeList, handleSelectPlace, focus, revealMap],
  );

  const selectStop = useCallback(
    (stop: BusStop) => {
      setSelectedPlaceId(null);
      setMarker((cur) => {
        if (cur?.kind === "stop" && cur.stop.stationId === stop.stationId) return null;
        focus(stop.lat, stop.lng, 280);
        revealMap();
        return { kind: "stop", stop };
      });
    },
    [focus, revealMap],
  );

  const selectIncident = useCallback(
    (incident: Incident) => {
      setSelectedPlaceId(null);
      setMarker((cur) => {
        if (cur?.kind === "incident" && cur.incident.id === incident.id) return null;
        if (incident.lat != null && incident.lng != null) focus(incident.lat, incident.lng, 500);
        revealMap();
        return { kind: "incident", incident };
      });
    },
    [focus, revealMap],
  );

  const selectCctv = useCallback(
    (cctv: Cctv) => {
      setSelectedPlaceId(null);
      setMarker((cur) => {
        if (cur?.kind === "cctv" && cur.cctv.id === cctv.id) return null;
        revealMap();
        return { kind: "cctv", cctv };
      });
    },
    [revealMap],
  );

  const selectEmergency = useCallback(
    (room: EmergencyRoom) => {
      setSelectedPlaceId(null);
      setMarker((cur) => {
        if (cur?.kind === "emergency" && cur.room.id === room.id) return null;
        focus(room.lat, room.lng, 600);
        revealMap();
        return { kind: "emergency", room };
      });
    },
    [focus, revealMap],
  );

  const selectLandmark = useCallback(
    (landmark: LandmarkItem) => {
      setSelectedPlaceId(null);
      setMarker((cur) => {
        if (cur?.kind === "landmark" && cur.landmark.name === landmark.name) return null;
        focus(landmark.lat, landmark.lng, 450);
        revealMap();
        return { kind: "landmark", landmark };
      });
    },
    [focus, revealMap],
  );

  const selectEv = useCallback(
    (station: EvStation) => {
      setSelectedPlaceId(null);
      setMarker((cur) => {
        if (cur?.kind === "ev" && cur.station.id === station.id) return null;
        focus(station.lat, station.lng, 320);
        revealMap();
        return { kind: "ev", station };
      });
    },
    [focus, revealMap],
  );

  const selectShelter = useCallback(
    (shelter: ShelterItem) => {
      setSelectedPlaceId(null);
      setMarker((cur) => {
        if (cur?.kind === "shelter" && cur.shelter.id === shelter.id) return null;
        focus(shelter.lat, shelter.lng, 350);
        revealMap();
        return { kind: "shelter", shelter };
      });
    },
    [focus, revealMap],
  );

  const selectLibrary = useCallback(
    (library: LibraryItem) => {
      if (library.lat == null || library.lng == null) return;
      const lat = library.lat;
      const lng = library.lng;
      setSelectedPlaceId(null);
      setMarker((cur) => {
        if (cur?.kind === "library" && cur.library.id === library.id) return null;
        focus(lat, lng, 350);
        revealMap();
        return { kind: "library", library };
      });
    },
    [focus, revealMap],
  );

  const selectCurrencyMerchant = useCallback(
    (merchant: LocalCurrencyMerchant) => {
      setSelectedPlaceId(null);
      setMarker((cur) => {
        if (cur?.kind === "currency" && cur.merchant.id === merchant.id) return null;
        if (merchant.lat != null && merchant.lng != null) {
          focus(merchant.lat, merchant.lng, 280);
        }
        revealMap();
        return { kind: "currency", merchant };
      });
    },
    [focus, revealMap],
  );

  const focusSavedStop = useCallback(
    (st: SavedStop) => {
      const live = transit.data?.data.stops.find((s) => s.stationId === st.stationId);
      const stop: BusStop = live ?? {
        stationId: st.stationId,
        name: st.name,
        mobileNo: st.mobileNo,
        lat: st.lat,
        lng: st.lng,
        distance: null,
        arrivals: [],
      };
      setSelectedPlaceId(null);
      setMarker({ kind: "stop", stop });
      focus(st.lat, st.lng, 260);
      revealMap();
    },
    [transit.data, focus, revealMap],
  );

  const handleToggleHomeDong = useCallback(
    (name: string) => {
      setHomeDong(homeDong === name ? null : name);
    },
    [homeDong],
  );

  const goToHomeDong = useCallback(() => {
    if (!homeDong) return;
    const box = DONG_BBOX[homeDong];
    if (box) setFitBounds({ ...box });
    setActiveDong(homeDong);
    revealMap();
  }, [homeDong, revealMap]);

  const toggleBusTrack = useCallback((rid: string, name: string) => {
    setTracked((cur) => (cur?.id === rid ? null : { id: rid, name }));
  }, []);

  const toggleBusAlert = useCallback(
    (stop: BusStop, routeId: string, routeName: string, predictSec: number) => {
      setFiredAlert(null);
      setBusAlert((cur) => {
        if (cur?.stationId === stop.stationId && cur?.routeId === routeId) return null;
        return {
          stationId: stop.stationId,
          stationName: stop.name,
          routeId,
          routeName,
          thresholdSec: predictSec > 180 ? 180 : 60,
          setAt: Date.now(),
        };
      });
    },
    [],
  );

  const markerId =
    marker?.kind === "stop"
      ? `stop:${marker.stop.stationId}`
      : marker?.kind === "incident"
        ? `incident:${marker.incident.id}`
        : marker?.kind === "cctv"
          ? `cctv:${marker.cctv.id}`
          : marker?.kind === "emergency"
            ? `emergency:${marker.room.id}`
            : marker?.kind === "landmark"
              ? `landmark:${marker.landmark.name}`
              : marker?.kind === "ev"
                ? `ev:${marker.station.id}`
                : marker?.kind === "shelter"
                  ? `shelter:${marker.shelter.id}`
                  : marker?.kind === "library"
                    ? `library:${marker.library.id}`
                    : marker?.kind === "currency"
                      ? `currency:${marker.merchant.id}`
                      : null;

  const selectedPlace = useMemo(
    () =>
      placeList.find((p) => p.id === selectedPlaceId) ??
      (pinned?.id === selectedPlaceId ? pinned : null),
    [placeList, selectedPlaceId, pinned],
  );

  /** 화면 아래에 카드가 떠 있는가 — 범례를 비켜 주는 판단에 쓴다 */
  const bottomCard = !!(selectedPlaceId || marker);

  const basePlaces = def?.layers.places ? placeList : NO_PLACES;
  const mapPlaces = useMemo(() => {
    // 한 종류만 고르면 지도도 그것만 남긴다
    let narrowed = only ? basePlaces.filter((p) => p.category === only) : basePlaces;
    if (mode === "dong" && industryFilter) {
      narrowed = narrowed.filter(
        (p) => p.category !== "MFG" || industryGroup(p.categoryName).id === industryFilter,
      );
    }
    // 검색·목록에서 고른 곳은 좁히기와 무관하게 남긴다 — 방금 찾은 것이 사라지면 당황한다
    return pinned && !narrowed.some((p) => p.id === pinned.id)
      ? [...narrowed, pinned]
      : narrowed;
  }, [basePlaces, pinned, only, mode, industryFilter]);
  const mapIncidents = def?.layers.incidents
    ? (traffic.data?.data.incidents ?? NO_INCIDENTS)
    : NO_INCIDENTS;
  const mapStops = def?.layers.bus ? (transit.data?.data.stops ?? NO_STOPS) : NO_STOPS;

  /**
   * 도로 소통상태.
   *
   * 형상은 하루가 지나도 그대로라 한 번만 받는다. 속도는 45초마다 오지만
   * 7KB 남짓이다. 둘을 여기서 맞물려 그릴 조각을 만든다.
   */
  const roads = useSWR<ApiEnvelope<RoadsPayload>>(
    def?.layers.traffic ? "/api/roads" : null,
    swrFetcher,
    { revalidateOnFocus: false, revalidateIfStale: false, dedupingInterval: 6 * 60 * 60_000 },
  );
  const cctv = useSWR<ApiEnvelope<CctvPayload>>(
    def?.layers.cctv ? "/api/cctv" : null,
    swrFetcher,
    // 카메라 위치는 바뀌지 않는다. 영상만 카드에서 따로 갱신한다.
    { revalidateOnFocus: false, dedupingInterval: 30 * 60_000 },
  );
  const mapCctvs = def?.layers.cctv ? (cctv.data?.data.cameras ?? NO_CCTVS) : NO_CCTVS;

  const trafficSegments = useMemo(() => {
    if (!def?.layers.traffic) return NO_SEGMENTS;
    const ways = roads.data?.data.roads;
    const speeds = traffic.data?.data.speeds;
    if (!ways?.length || !speeds?.length) return NO_SEGMENTS;
    return buildSegments(ways, speeds);
  }, [def?.layers.traffic, roads.data, traffic.data]);
  const mapLandmarks = mode === null ? LANDMARKS : NO_LANDMARKS;
  /*
   * 노선을 좇는 중이면 그 노선만, 아니면 근처 노선들을 보여준다.
   * 좇는 노선을 고른 사람은 그 버스를 보려는 것이지 스무 대를 보려는
   * 것이 아니다.
   */
  /**
   * 지금 지도에 뜬 노선들의 주행 경로.
   *
   * 버스를 그 위로 움직여 코너에서 도로를 가로지르지 않게 한다.
   * 경로는 바뀌지 않으므로 한 번 받아 오래 들고 있는다 — 노선 셋에
   * 33KB 이고 하루를 캐시한다.
   */
  const shownRouteIds = useMemo(() => {
    const ids = tracked
      ? [tracked.id]
      : (busFleet.data?.ok ? busFleet.data.data.routes : [])
          .filter((r) => r.positions.length)
          .map((r) => r.routeId);
    return ids.filter(Boolean).sort().join(",");
  }, [tracked, busFleet.data]);

  const busRoutePaths = useSWR<ApiEnvelope<{ paths: Record<string, LatLng[]> }>>(
    shownRouteIds ? `/api/bus-route?routeIds=${shownRouteIds}` : null,
    swrFetcher,
    { revalidateOnFocus: false, revalidateIfStale: false, dedupingInterval: 12 * 60 * 60_000 },
  );

  const mapBusPositions = useMemo(() => {
    if (tracked) {
      return busPositions.data?.ok ? [busPositions.data.data] : NO_BUSES;
    }
    return busFleet.data?.ok ? busFleet.data.data.routes : NO_BUSES;
  }, [tracked, busPositions.data, busFleet.data]);

  const medicalMarkers = useMemo(
    () =>
      mode === "medical"
        ? (medical.data?.data.places ?? []).filter(
            (p) => p.openNow === true && p.lat != null && p.lng != null,
          )
        : NO_MEDICAL,
    [mode, medical.data],
  );

  const emergencyMarkers = useMemo(
    () => (mode === "medical" ? (emergency.data?.data.rooms ?? NO_EMERGENCY) : NO_EMERGENCY),
    [mode, emergency.data],
  );

  const trackedRoutePath = useMemo(
    () => (tracked ? (busRoutePaths.data?.data.paths[tracked.id] ?? null) : null),
    [tracked, busRoutePaths.data],
  );

  const evMarkers = useMemo(
    () => (mode === "transit" ? (evChargers.data?.data.stations ?? NO_EV) : NO_EV),
    [mode, evChargers.data],
  );

  const shelterMarkers = useMemo(
    () => (mode === "weather" ? (shelters.data?.data.shelters ?? NO_SHELTERS) : NO_SHELTERS),
    [mode, shelters.data],
  );

  const libraryMarkers = useMemo(
    () => (mode === "life" ? (libraries.data?.data.libraries ?? NO_LIBRARIES) : NO_LIBRARIES),
    [mode, libraries.data],
  );

  // ── 시트 내용 ─────────────────────────────────────────
  const card = (id: CardId) => {
    switch (id) {
      case "emergency":
        return (
          <EmergencyPanel
            key={id}
            res={emergency.data}
            isLoading={emergency.isLoading}
            error={emergency.error}
            onFocus={selectEmergency}
          />
        );
      case "weather":
        return (
          <WeatherPanel
            key={id}
            res={weather.data}
            isLoading={weather.isLoading}
            error={weather.error}
          />
        );
      case "air":
        return (
          <AirPanel
            key={id}
            res={air.data}
            isLoading={air.isLoading}
            error={air.error}
          />
        );
      case "shelter":
        return (
          <ShelterPanel
            key={id}
            res={shelters.data}
            isLoading={shelters.isLoading}
            error={shelters.error}
            onSelect={selectShelter}
          />
        );
      case "medical":
        return (
          <MedicalPanel
            key={id}
            res={medical.data}
            isLoading={medical.isLoading}
            error={medical.error}
            onSelect={selectMedical}
          />
        );
      case "subway":
        return (
          <SubwayPanel
            key={id}
            res={subway.data}
            isLoading={subway.isLoading}
            error={subway.error}
            onFocusStation={(lat, lng) => {
              focus(lat, lng, 320);
              revealMap();
            }}
          />
        );
      case "traffic":
        return (
          <TrafficPanel
            key={id}
            res={traffic.data}
            isLoading={traffic.isLoading}
            error={traffic.error}
            onSelectIncident={selectIncident}
          />
        );
      case "ev":
        return (
          <EvChargersPanel
            key={id}
            res={evChargers.data}
            isLoading={evChargers.isLoading}
            error={evChargers.error}
            onSelect={selectEv}
          />
        );
      case "cctv":
        return (
          <CctvPanel
            key={id}
            res={cctv.data}
            isLoading={cctv.isLoading}
            error={cctv.error}
            activeCctvId={marker?.kind === "cctv" ? marker.cctv.id : null}
            onSelect={(c) => {
              selectCctv(c);
              focus(c.lat, c.lng, 500);
            }}
          />
        );
      case "transit":
        return (
          <TransitPanel
            key={id}
            res={transit.data}
            isLoading={transit.isLoading}
            error={transit.error}
            onSelectStop={selectStop}
            trackedRouteId={tracked?.id ?? null}
            onTrackRoute={(rid, name) => {
              toggleBusTrack(rid, name);
              revealMap();
            }}
            busAlert={busAlert}
            onToggleAlert={toggleBusAlert}
            savedStops={savedStops}
            onFocusSavedStop={focusSavedStop}
            onToggleSaveStop={toggleSavedStop}
            onRemoveSavedStop={removeSavedStop}
          />
        );
      case "currency":
        return (
          <LocalCurrencyPanel
            key={id}
            res={localCurrency.data}
            isLoading={localCurrency.isLoading}
            error={localCurrency.error}
            defaultCategory={mode === "food" ? "food" : "all"}
            onSelect={selectCurrencyMerchant}
          />
        );
      case "libraries":
        return (
          <LibrariesPanel
            key={id}
            res={libraries.data}
            isLoading={libraries.isLoading}
            error={libraries.error}
            onSelect={selectLibrary}
          />
        );
      case "waste":
        return <WastePanel key={id} />;
      case "compare":
        return (
          <DongComparePanel
            key={id}
            medical={medical.data}
            factories={factories.data}
            evChargers={evChargers.data}
            activeDong={activeDong}
            onSelectDong={toggleDong}
          />
        );
      case "industry":
        return (
          <IndustryPanel
            key={id}
            res={factories.data}
            isLoading={factories.isLoading}
            error={factories.error}
            onSelectDong={toggleDong}
            activeDong={activeDong}
            activeGroup={industryFilter}
            onSelectGroup={(g) => {
              setIndustryFilter(g);
              if (g) revealMap();
            }}
            onFocusFactory={selectFactory}
          />
        );
      case "population":
        return (
          <PopulationPanel
            key={id}
            onSelectDong={toggleDong}
            activeDong={activeDong}
            homeDong={homeDong}
            onToggleHomeDong={handleToggleHomeDong}
          />
        );
      case "notices":
        return (
          <NoticesPanel
            key={id}
            res={notices.data}
            isLoading={notices.isLoading}
            error={notices.error}
          />
        );
      case "news":
        return (
          <NewsPanel
            key={id}
            res={news.data}
            isLoading={news.isLoading}
            isValidating={news.isValidating}
            error={news.error}
            query={newsQuery}
            onQueryChange={setNewsQuery}
          />
        );
    }
  };

  /** 의왕 측정소 가운데 가장 나쁜 등급 — 조심하는 쪽으로 말한다 */
  const airGrade = overallGrade(air.data?.data.stations ?? []);

  /** 지도 위에 떠 있는 버튼 공통 스타일 */
  const mapBtn = "glass map-btn press";

  /** 요약줄 칸 → 메뉴. 요약줄은 메뉴로 가는 지름길일 뿐, 따로 열리는 창이 없다 */
  const TAB_MODE: Record<InfoTab, ModeId> = {
    weather: "weather",
    air: "weather",
    news: "news",
    traffic: "transit",
    medical: "medical",
  };
  const openTab: InfoTab | null =
    mode === "weather"
      ? summaryWeatherTab
      : mode === "news"
        ? "news"
        : mode === "transit"
          ? "traffic"
          : mode === "medical"
            ? "medical"
            : null;
  const openFromSummary = (t: InfoTab) => {
    if (t === "weather" || t === "air") {
      if (mode === "weather" && sheetOpen && summaryWeatherTab !== t) {
        setSummaryWeatherTab(t);
        return;
      }
      setSummaryWeatherTab(t);
    }
    toggleMode(TAB_MODE[t]);
  };

  const summary = (
    <SummaryStrip
      weather={weather.data}
      air={air.data}
      traffic={traffic.data}
      medical={medical.data}
      news={news.data}
      openTab={openTab}
      onOpenInfo={openFromSummary}
    />
  );

  return (
    <div className="relative h-dvh overflow-hidden bg-[var(--bg)]">
      {/*
        지도 — 화면 전체.
        isolate 로 지도 안의 겹침 순서를 이 상자 안에 가둔다. Leaflet 은 층마다
        z-index 200~1000 을 쓰는데, 가두지 않으면 그 층들이 상단 바(z-40)와
        메뉴 위로 올라와 화면에 지도만 남는다.
      */}
      <div className="dots absolute inset-0 isolate">
        <KakaoMap
          appKey={appKey}
          center={center}
          level={level}
          places={mapPlaces}
          incidents={mapIncidents}
          busStops={mapStops}
          medicalOpen={medicalMarkers}
          emergencyRooms={emergencyMarkers}
          busPositions={mapBusPositions}
          busPaths={busRoutePaths.data?.data.paths ?? NO_PATHS}
          trackedRoutePath={trackedRoutePath}
          landmarks={mapLandmarks}
          evStations={evMarkers}
          shelters={shelterMarkers}
          libraries={libraryMarkers}
          showBoundary
          activeDong={activeDong}
          trafficSegments={trafficSegments}
          me={me && me.inUiwang ? { lat: me.lat, lng: me.lng } : null}
          cctvs={mapCctvs}
          onSelectCctv={selectCctv}
          fitBounds={fitBounds}
          dimOutside={mode === null}
          selectedPlaceId={selectedPlaceId}
          selectedMarkerId={markerId}
          onSelectPlace={handleSelectPlace}
          onSelectMedical={selectMedical}
          onSelectEmergency={selectEmergency}
          onSelectLandmark={selectLandmark}
          onSelectEv={selectEv}
          onSelectShelter={selectShelter}
          onSelectLibrary={selectLibrary}
          onSelectBus={toggleBusTrack}
          onSelectStop={selectStop}
          onSelectIncident={selectIncident}
          onMapMoved={setCenter}
          onBoundsChanged={onBoundsChanged}
          sheetOpen={!!def && sheetOpen}
          onViewFitted={(c, lv) => {
            setCenter(c);
            setLevel(lv);
          }}
        />
      </div>

      {/*
        상단 — 이름, 오늘 요약, 찾기. 이것뿐이다.
        요약 칸을 누르면 하단 메뉴의 같은 항목이 열린다. 따로 뜨는 창이
        없으니 길을 잃을 일이 없다.
      */}
      <header className="pointer-events-none absolute inset-x-0 top-0 z-40 px-2.5 pb-2 pt-[calc(10px+env(safe-area-inset-top,0px))] sm:p-3">
        <div className="flex items-center gap-2">
          <div className="glass pointer-events-auto flex h-12 min-w-0 flex-1 items-center gap-2 rounded-[var(--radius-full)] pl-1.5 pr-2">
            <button
              type="button"
              onClick={() => {
                setMode(null);
                setSheetOpen(false);
                setSelectedPlaceId(null);
                setMarker(null);
              }}
              className="flex shrink-0 items-center gap-2 rounded-[var(--radius-full)] py-1 pl-1 pr-2"
              title="처음 화면으로"
            >
              <Logo size={32} />
              <span className="text-[length:var(--text-base)] font-extrabold tracking-tight">
                의왕 인사이드
              </span>
            </button>
            {/* 좁은 화면에서는 요약을 아래 자기 줄로 내린다 — 여기선 기온 하나만 들어간다 */}
            <span className="hidden h-6 w-[2px] shrink-0 rounded-full bg-[var(--border)] sm:block" />
            <div className="hidden min-w-0 flex-1 sm:block">{summary}</div>
          </div>

          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            title="이름으로 찾기"
            aria-label="이름으로 찾기"
            className={`pointer-events-auto ${mapBtn}`}
          >
            <Icon name="search" size={22} />
          </button>
        </div>

        <div className="glass pointer-events-auto mt-1.5 flex h-10 items-center overflow-hidden rounded-[var(--radius-full)] px-1.5 sm:hidden">
          {summary}
        </div>
      </header>

      {/*
        지도 컨트롤 — 내 위치와 확대·축소만.
        모바일에서는 하단 카드/시트가 없을 때 오른손 엄지 닿는 위치(하단 메뉴 바로 위)에 두고,
        바텀시트나 상세 카드가 열리면 지도가 보이는 위쪽 우측으로 자연스럽게 올린다.
      */}
      <div
        className={`absolute right-3 z-20 flex flex-col gap-2 sm:bottom-auto sm:top-[76px] sm:gap-2.5 ${
          !bottomCard && !sheetOpen
            ? "bottom-[calc(var(--dock-h)+14px)]"
            : "top-[calc(114px+env(safe-area-inset-top,0px))]"
        }`}
      >
        {homeDong && (
          <button
            type="button"
            onClick={goToHomeDong}
            title={`내 동네 (${homeDong})로 이동`}
            aria-label={`내 동네 (${homeDong})로 이동`}
            className={mapBtn}
            style={
              activeDong === homeDong
                ? { background: "var(--brand-2)", color: "var(--ink)" }
                : undefined
            }
          >
            <span aria-hidden className="text-[1.2rem] leading-none">
              🏠
            </span>
          </button>
        )}
        {/*
          내 위치.
          위치는 방문 즉시 묻지 않는다 — 그때 뜨는 권한 팝업은 대부분
          거부되고, 한 번 거부되면 다시 묻기 어렵다. 누를 때만 묻는다.
        */}
        <button
          type="button"
          onClick={goToMe}
          disabled={myLocation.state.status === "asking"}
          title="내 위치로"
          aria-label="내 위치로"
          className={mapBtn}
          style={
            myLocation.state.status === "ok"
              ? { background: "var(--brand-2)", color: "var(--ink)" }
              : undefined
          }
        >
          {myLocation.state.status === "asking" ? "…" : <Icon name="locate" size={22} />}
        </button>
        <button
          type="button"
          onClick={() => setLevel((l) => Math.max(1, l - 1))}
          aria-label="확대"
          className={mapBtn}
        >
          <Icon name="plus" size={22} />
        </button>
        <button
          type="button"
          onClick={() => setLevel((l) => Math.min(12, l + 1))}
          aria-label="축소"
          className={mapBtn}
        >
          <Icon name="minus" size={22} />
        </button>
      </div>

      {/*
        오늘 공기 — 첫 화면에서 메뉴를 열지 않아도 보인다.
        얼굴과 한마디가 먼저, 누르면 날씨·공기 메뉴가 열린다.
        내용 카드·하단 카드·상단 추적/알림 배너가 떠 있을 때는 비켜 준다.
      */}
      {airGrade && !sheetOpen && !bottomCard && !tracked && !busAlert && !locNotice && !firedAlert && (
        <button
          type="button"
          onClick={() => {
            setSummaryWeatherTab("air");
            toggleMode("weather");
          }}
          title="공기 자세히 보기"
          className="glass press pop-in absolute left-3 top-[calc(114px+env(safe-area-inset-top,0px))] z-20 flex items-center gap-2 rounded-[var(--radius-lg)] py-2 pl-2.5 pr-3.5 text-left sm:top-[76px]"
          style={{ background: AIR_STYLE[airGrade].tint, color: "#23201c" }}
        >
          <span aria-hidden className="text-[1.9rem] leading-none">
            {AIR_STYLE[airGrade].emoji}
          </span>
          <span className="leading-tight">
            <span className="block text-[length:var(--text-2xs)] font-bold opacity-75">
              의왕 공기
            </span>
            <span className="block text-[length:var(--text-base)] font-extrabold">{airGrade}</span>
          </span>
        </button>
      )}

      {/*
        위치 안내. 권한 거부나 '의왕 밖' 같은 것은 눌러본 사람만 알면
        되는 이야기라 잠깐 떴다 사라지는 자리에 둔다.
      */}
      {locNotice && (
        <div className="pointer-events-none absolute inset-x-0 top-[calc(114px+env(safe-area-inset-top,0px))] z-40 flex justify-center px-4 sm:top-[76px] sm:px-16">
          <button
            type="button"
            onClick={() => setLocNotice(null)}
            className="glass pop-in pointer-events-auto max-w-[420px] rounded-[var(--radius-lg)] px-4 py-2.5 text-[length:var(--text-sm)] font-bold"
          >
            {locNotice} <span className="text-[var(--text-faint)]">✕</span>
          </button>
        </div>
      )}

      {/* 버스 도착 알림 발동 배너 */}
      {firedAlert && (
        <div className="pointer-events-none absolute inset-x-0 top-[calc(114px+env(safe-area-inset-top,0px))] z-50 flex justify-center px-3 sm:top-[76px] sm:px-4">
          <button
            type="button"
            onClick={() => setFiredAlert(null)}
            className="pop-in pointer-events-auto flex max-w-[420px] items-center gap-2.5 rounded-[var(--radius-full)] border-2 border-[var(--ink)] bg-[var(--brand)] px-4 py-2.5 text-left text-[length:var(--text-sm)] font-extrabold text-white shadow-[var(--shadow-lg)]"
          >
            <span aria-hidden className="text-lg leading-none">
              🔔
            </span>
            <span className="min-w-0 flex-1">
              {firedAlert.stationName} · {firedAlert.routeName}번{" "}
              {firedAlert.predictSec < 60
                ? "곧 도착!"
                : `약 ${Math.max(1, Math.round(firedAlert.predictSec / 60))}분 전`}
            </span>
            <span className="text-xs opacity-80">확인 ✕</span>
          </button>
        </div>
      )}

      {/* 버스 노선 경로 추적 / 도착 알림 대기 중 플로팅 칩 */}
      {(tracked || busAlert) && !firedAlert && !locNotice && (
        <div className="pointer-events-none absolute inset-x-0 top-[calc(114px+env(safe-area-inset-top,0px))] z-20 flex flex-wrap justify-center gap-1.5 px-3 sm:top-[76px] sm:px-16">
          {tracked && (
            <button
              type="button"
              onClick={() => setTracked(null)}
              className="glass press pop-in pointer-events-auto inline-flex min-h-[38px] items-center gap-1.5 rounded-[var(--radius-full)] px-3.5 text-[length:var(--text-xs)] font-extrabold"
            >
              <span aria-hidden>🚍</span>
              <span>{tracked.name}번 경로 표시 중</span>
              <span className="text-[var(--text-faint)]">✕</span>
            </button>
          )}
          {busAlert && (
            <button
              type="button"
              onClick={() => setBusAlert(null)}
              className="glass press pop-in pointer-events-auto inline-flex min-h-[38px] items-center gap-1.5 rounded-[var(--radius-full)] px-3.5 text-[length:var(--text-xs)] font-extrabold"
            >
              <span aria-hidden>🔔</span>
              <span>
                {busAlert.routeName}번 {Math.round(busAlert.thresholdSec / 60)}분 전 알림 대기
              </span>
              <span className="text-[var(--text-faint)]">✕</span>
            </button>
          )}
        </div>
      )}

      {/* 색만 칠해두고 뜻을 안 알려주면 읽을 수 없다 */}
      {trafficSegments.length > 0 && !bottomCard && !sheetOpen && (
        <div className="glass absolute bottom-[calc(var(--dock-h)+8px)] left-3 z-10 rounded-[var(--radius-lg)] px-3 py-2">
          <p className="mb-1 text-[length:var(--text-2xs)] font-extrabold">도로 소통</p>
          <div className="flex gap-2.5">
            {(["congested", "slow", "smooth"] as const).map((lv) => (
              <span key={lv} className="flex items-center gap-1">
                <span
                  aria-hidden
                  className="h-[5px] w-5 rounded-full"
                  style={{ background: LEVEL_COLOR[lv] }}
                />
                <span className="text-[length:var(--text-2xs)] font-bold">{LEVEL_LABEL[lv]}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {marker?.kind === "stop" && (
        <StopCard
          key={marker.stop.stationId}
          stop={
            transit.data?.data.stops.find((s) => s.stationId === marker.stop.stationId) ??
            marker.stop
          }
          trackedRouteId={tracked?.id ?? null}
          onTrackRoute={toggleBusTrack}
          busAlert={busAlert}
          onToggleAlert={toggleBusAlert}
          isSaved={savedStops.some((s) => s.stationId === marker.stop.stationId)}
          onToggleSave={toggleSavedStop}
          onClose={() => setMarker(null)}
        />
      )}

      {marker?.kind === "incident" && (
        <MapCard
          key={marker.incident.id}
          title={marker.incident.type}
          accent="var(--danger)"
          subtitle={marker.incident.road || "돌발상황"}
          onClose={() => setMarker(null)}
        >
          <p className="mt-3 text-[length:var(--text-sm)] leading-relaxed">
            {marker.incident.message}
          </p>
          <p className="mt-2 text-[length:var(--text-2xs)] text-[var(--text-faint)]">
            {timeAgo(marker.incident.startedAt)} 접수
          </p>
        </MapCard>
      )}

      {marker?.kind === "cctv" && (
        <CctvCard key={marker.cctv.id} cctv={marker.cctv} onClose={() => setMarker(null)} />
      )}

      {marker?.kind === "emergency" && (
        <MapCard
          key={marker.room.id}
          title={marker.room.name}
          accent="var(--danger)"
          subtitle={[marker.room.level, formatDistance(marker.room.distance)].filter(Boolean).join(" · ")}
          copyAddress={marker.room.address || undefined}
          share={{
            title: marker.room.name,
            text: marker.room.address || "응급실",
            lat: marker.room.lat,
            lng: marker.room.lng,
          }}
          onClose={() => setMarker(null)}
        >
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-[length:var(--text-xs)] font-bold text-[var(--text-muted)]">
              가용 병상
            </span>
            <span
              className="tnum text-[length:var(--text-lg)] font-extrabold"
              style={{
                color:
                  marker.room.beds == null
                    ? "var(--text-muted)"
                    : marker.room.beds <= 0
                      ? "var(--danger)"
                      : marker.room.beds <= 2
                        ? "var(--warn)"
                        : "var(--ok)",
              }}
            >
              {marker.room.beds == null
                ? "정보 없음"
                : marker.room.beds <= 0
                  ? "포화"
                  : marker.room.totalBeds
                    ? `${marker.room.beds} / ${marker.room.totalBeds}병상`
                    : `${marker.room.beds}병상`}
            </span>
          </div>
          {marker.room.address && (
            <p className="mt-2 text-[length:var(--text-xs)] text-[var(--text-muted)]">
              {marker.room.address}
            </p>
          )}
          <div className="mt-3 flex gap-2">
            {marker.room.phone && (
              <a
                href={`tel:${marker.room.phone}`}
                className="brand-fill press inline-flex min-h-[44px] flex-1 items-center justify-center rounded-[var(--radius-full)] border-2 px-3 text-[length:var(--text-xs)] font-extrabold shadow-[var(--shadow-sm)]"
              >
                📞 {marker.room.phone}
              </a>
            )}
            <a
              href={`https://map.kakao.com/link/to/${encodeURIComponent(marker.room.name)},${marker.room.lat},${marker.room.lng}`}
              target="_blank"
              rel="noreferrer noopener"
              className="press inline-flex min-h-[44px] flex-1 items-center justify-center rounded-[var(--radius-full)] border-2 border-[var(--ink)] text-[length:var(--text-sm)] font-bold shadow-[var(--shadow-sm)]"
            >
              길찾기
            </a>
          </div>
        </MapCard>
      )}

      {marker?.kind === "landmark" && (
        <MapCard
          key={marker.landmark.name}
          title={marker.landmark.name}
          accent="#7c3aed"
          subtitle="의왕 대표 명소"
          share={{
            title: marker.landmark.name,
            text: marker.landmark.desc,
            lat: marker.landmark.lat,
            lng: marker.landmark.lng,
          }}
          onClose={() => setMarker(null)}
        >
          <p className="mt-3 text-[length:var(--text-sm)] leading-relaxed text-[var(--text-muted)]">
            {marker.landmark.desc}
          </p>
          <div className="mt-3 flex gap-2">
            <a
              href={`https://map.kakao.com/link/to/${encodeURIComponent(marker.landmark.name)},${marker.landmark.lat},${marker.landmark.lng}`}
              target="_blank"
              rel="noreferrer noopener"
              className="brand-fill press inline-flex min-h-[44px] flex-1 items-center justify-center rounded-[var(--radius-full)] border-2 text-[length:var(--text-sm)] font-bold shadow-[var(--shadow-sm)]"
            >
              길찾기 ↗
            </a>
          </div>
        </MapCard>
      )}

      {marker?.kind === "ev" && (
        <MapCard
          key={marker.station.id}
          title={marker.station.name}
          accent={marker.station.available > 0 ? "#237a35" : "#6b7280"}
          subtitle={[marker.station.operator, marker.station.dong].filter(Boolean).join(" · ") || "전기차 충전소"}
          copyAddress={marker.station.address || undefined}
          share={{
            title: marker.station.name,
            text: marker.station.address || "전기차 충전소",
            lat: marker.station.lat,
            lng: marker.station.lng,
          }}
          onClose={() => setMarker(null)}
        >
          <div className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span
              className="tnum text-[length:var(--text-lg)] font-extrabold"
              style={{ color: marker.station.available > 0 ? "var(--ok)" : "var(--text-muted)" }}
            >
              {marker.station.available > 0
                ? `충전 가능 ${marker.station.available} / ${marker.station.total}기`
                : `전부 사용 중 (${marker.station.total}기)`}
            </span>
            <span className="text-[length:var(--text-xs)] text-[var(--text-muted)]">
              {[
                marker.station.fastCount > 0 ? `급속 ${marker.station.fastCount}` : "",
                marker.station.slowCount > 0 ? `완속 ${marker.station.slowCount}` : "",
                marker.station.maxOutputKw ? `최대 ${marker.station.maxOutputKw}kW` : "",
              ]
                .filter(Boolean)
                .join(" · ")}
            </span>
          </div>
          <div className="mt-2 space-y-0.5 text-[length:var(--text-xs)] text-[var(--text-muted)]">
            {marker.station.address && <p>{marker.station.address}</p>}
            <p>
              {[
                marker.station.useTime,
                marker.station.parkingFree === true ? "주차 무료" : "",
                marker.station.limitYn ? marker.station.limitDetail || "외부인 이용 제한" : "외부 개방",
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>
          <div className="mt-3 flex gap-2">
            <a
              href={`https://map.kakao.com/link/to/${encodeURIComponent(marker.station.name)},${marker.station.lat},${marker.station.lng}`}
              target="_blank"
              rel="noreferrer noopener"
              className="brand-fill press inline-flex min-h-[44px] flex-1 items-center justify-center rounded-[var(--radius-full)] border-2 text-[length:var(--text-sm)] font-bold shadow-[var(--shadow-sm)]"
            >
              길찾기 ↗
            </a>
          </div>
        </MapCard>
      )}

      {marker?.kind === "shelter" && (
        <MapCard
          key={marker.shelter.id}
          title={marker.shelter.name}
          accent={
            marker.shelter.kind === "cold"
              ? "#1864ab"
              : marker.shelter.kind === "quake"
                ? "#7c3aed"
                : "#c84600"
          }
          subtitle={[
            marker.shelter.kind === "cold"
              ? "한파쉼터"
              : marker.shelter.kind === "quake"
                ? "지진대피소"
                : "무더위쉼터",
            marker.shelter.facilityType,
            marker.shelter.dong,
          ]
            .filter(Boolean)
            .join(" · ")}
          copyAddress={marker.shelter.address || undefined}
          share={{
            title: marker.shelter.name,
            text: marker.shelter.address || "의왕시 쉼터",
            lat: marker.shelter.lat,
            lng: marker.shelter.lng,
          }}
          onClose={() => setMarker(null)}
        >
          <div className="mt-3 space-y-1 text-[length:var(--text-xs)] text-[var(--text-muted)]">
            {marker.shelter.address && <p>{marker.shelter.address}</p>}
            {marker.shelter.capacity != null && (
              <p className="font-bold text-[var(--text)]">
                수용 가능 인원: {marker.shelter.capacity.toLocaleString("ko-KR")}명
              </p>
            )}
            {marker.shelter.useHours && <p>운영시간: {marker.shelter.useHours}</p>}
            {marker.shelter.coolingInfo && <p>냉·난방: {marker.shelter.coolingInfo}</p>}
          </div>
          <div className="mt-3 flex gap-2">
            <a
              href={`https://map.kakao.com/link/to/${encodeURIComponent(marker.shelter.name)},${marker.shelter.lat},${marker.shelter.lng}`}
              target="_blank"
              rel="noreferrer noopener"
              className="brand-fill press inline-flex min-h-[44px] flex-1 items-center justify-center rounded-[var(--radius-full)] border-2 text-[length:var(--text-sm)] font-bold shadow-[var(--shadow-sm)]"
            >
              길찾기 ↗
            </a>
          </div>
        </MapCard>
      )}

      {marker?.kind === "library" && (
        <MapCard
          key={marker.library.id}
          title={marker.library.name}
          accent="#4f46e5"
          subtitle={[marker.library.kind || "공공도서관", marker.library.dong].filter(Boolean).join(" · ")}
          copyAddress={marker.library.address || undefined}
          share={
            marker.library.lat != null && marker.library.lng != null
              ? {
                  title: marker.library.name,
                  text: marker.library.address || "의왕시 공공도서관",
                  lat: marker.library.lat,
                  lng: marker.library.lng,
                }
              : undefined
          }
          onClose={() => setMarker(null)}
        >
          <div className="mt-3 space-y-1 text-[length:var(--text-xs)] text-[var(--text-muted)]">
            {marker.library.address && <p>{marker.library.address}</p>}
            {(marker.library.seats != null || marker.library.books != null) && (
              <p className="font-bold text-[var(--text)]">
                {[
                  marker.library.seats != null
                    ? `열람석 ${marker.library.seats.toLocaleString("ko-KR")}석`
                    : "",
                  marker.library.books != null
                    ? `장서 ${marker.library.books.toLocaleString("ko-KR")}권`
                    : "",
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            )}
            {marker.library.weekdayHours && <p>평일: {marker.library.weekdayHours}</p>}
            {marker.library.weekendHours && <p>주말: {marker.library.weekendHours}</p>}
            {marker.library.closedDays && <p>휴관: {marker.library.closedDays}</p>}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {marker.library.phone && (
              <a
                href={`tel:${marker.library.phone}`}
                className="press inline-flex min-h-[44px] flex-1 items-center justify-center rounded-[var(--radius-full)] border-2 border-[var(--ink)] px-3 text-[length:var(--text-xs)] font-bold shadow-[var(--shadow-sm)]"
              >
                📞 전화
              </a>
            )}
            {marker.library.homepage && (
              <a
                href={marker.library.homepage}
                target="_blank"
                rel="noreferrer noopener"
                className="press inline-flex min-h-[44px] flex-1 items-center justify-center rounded-[var(--radius-full)] border-2 border-[var(--ink)] px-3 text-[length:var(--text-xs)] font-bold shadow-[var(--shadow-sm)]"
              >
                누리집 ↗
              </a>
            )}
            {marker.library.lat != null && marker.library.lng != null && (
              <a
                href={`https://map.kakao.com/link/to/${encodeURIComponent(marker.library.name)},${marker.library.lat},${marker.library.lng}`}
                target="_blank"
                rel="noreferrer noopener"
                className="brand-fill press inline-flex min-h-[44px] flex-1 items-center justify-center rounded-[var(--radius-full)] border-2 px-3 text-[length:var(--text-sm)] font-bold shadow-[var(--shadow-sm)]"
              >
                길찾기 ↗
              </a>
            )}
          </div>
        </MapCard>
      )}

      {marker?.kind === "currency" && (
        <MapCard
          key={marker.merchant.id}
          title={marker.merchant.name}
          accent="#c84600"
          subtitle={[
            "💳 의왕사랑상품권 가맹점",
            marker.merchant.industry,
            marker.merchant.dong,
          ]
            .filter(Boolean)
            .join(" · ")}
          copyAddress={marker.merchant.address || undefined}
          share={
            marker.merchant.lat != null && marker.merchant.lng != null
              ? {
                  title: marker.merchant.name,
                  text: marker.merchant.address || "의왕사랑상품권 가맹점",
                  lat: marker.merchant.lat,
                  lng: marker.merchant.lng,
                }
              : undefined
          }
          onClose={() => setMarker(null)}
        >
          {marker.merchant.address && (
            <p className="mt-3 text-[length:var(--text-xs)] text-[var(--text-muted)]">
              {marker.merchant.address}
            </p>
          )}
          <div className="mt-3 flex gap-2">
            {marker.merchant.phone && (
              <a
                href={`tel:${marker.merchant.phone}`}
                className="press inline-flex min-h-[44px] flex-1 items-center justify-center rounded-[var(--radius-full)] border-2 border-[var(--ink)] px-3 text-[length:var(--text-xs)] font-bold shadow-[var(--shadow-sm)]"
              >
                📞 {marker.merchant.phone}
              </a>
            )}
            {marker.merchant.lat != null && marker.merchant.lng != null && (
              <a
                href={`https://map.kakao.com/link/to/${encodeURIComponent(marker.merchant.name)},${marker.merchant.lat},${marker.merchant.lng}`}
                target="_blank"
                rel="noreferrer noopener"
                className="brand-fill press inline-flex min-h-[44px] flex-1 items-center justify-center rounded-[var(--radius-full)] border-2 px-3 text-[length:var(--text-sm)] font-bold shadow-[var(--shadow-sm)]"
              >
                길찾기 ↗
              </a>
            )}
          </div>
        </MapCard>
      )}

      {selectedPlace && (
        <PlaceDetailCard
          key={selectedPlace.id}
          place={selectedPlace}
          medical={medical.data?.data.places ?? NO_MEDICAL}
          medicalDay={medical.data?.data.day ?? 0}
          onClose={() => setSelectedPlaceId(null)}
        />
      )}

      {/*
        동을 고르면 그 동 이야기를 지도 위에 띄운다.
        다른 카드가 떠 있으면 비켜 준다 — 바닥에 카드 둘이 겹치면
        어느 것을 보고 있는지 알 수 없다.
      */}
      {activeDong && !bottomCard && !sheetOpen && (
        <DongCard
          key={activeDong}
          name={activeDong}
          factoryCount={dongFactoryCounts[activeDong]}
          isHome={homeDong === activeDong}
          onToggleHome={handleToggleHomeDong}
          onClose={() => {
            setActiveDong(null);
            setFitBounds(null);
          }}
          onOpenWaste={() => {
            setMode("waste");
            setSheetOpen(true);
          }}
        />
      )}

      {searchOpen && (
        <SearchOverlay center={center} onPick={pickSearched} onClose={() => setSearchOpen(false)} />
      )}

      {/*
        내용 카드 — 메뉴를 누르면 바로 이것이 뜬다. 안에 탭이 없다.
        모바일에서는 기본 반높이(half)로 열려 지도와 목록을 함께 보고,
        상단 손잡이를 위·아래로 쓸거나 눌러 전체(full)↔반높이↔닫기를 한 손으로 조작한다.
        넓은 화면에서는 왼쪽 400px 사이드바로 고정된다.
      */}
      {def && sheetOpen && (
        <aside
          key={def.id}
          aria-label={def.label}
          style={
            sheetDragY !== 0
              ? { transform: `translateY(${sheetDragY}px)`, transition: "none" }
              : undefined
          }
          className={`pop-in absolute inset-x-2.5 bottom-[calc(var(--dock-h)+6px)] z-30 flex flex-col overflow-hidden rounded-[var(--radius-xl)] border-2 border-[var(--frame)] bg-[var(--surface)] shadow-[var(--shadow-lg)] transition-[height,top,transform] duration-200 sm:inset-x-auto sm:left-3 sm:top-[76px] sm:h-auto sm:max-h-none sm:w-[400px] ${
            sheetSnap === "full"
              ? "top-[calc(114px+env(safe-area-inset-top,0px))]"
              : "h-[48dvh] max-h-[calc(100dvh-var(--dock-h)-130px-env(safe-area-inset-top,0px))]"
          }`}
        >
          {/* 모바일 전용 드래그 손잡이 — 탭하면 반높이↔전체, 아래로 쓸면 축소/닫기 */}
          <button
            type="button"
            onClick={() => setSheetSnap((s) => (s === "half" ? "full" : "half"))}
            onTouchStart={onSheetTouchStart}
            onTouchMove={onSheetTouchMove}
            onTouchEnd={onSheetTouchEnd}
            onTouchCancel={onSheetTouchEnd}
            aria-label={sheetSnap === "half" ? "패널 크게 보기" : "패널 반만 보기"}
            style={{ background: def.tint }}
            className="flex w-full touch-none items-center justify-center pt-2 pb-1 sm:hidden"
          >
            <span className="h-1.5 w-11 rounded-full bg-[#23201c]/30" />
          </button>

          <header
            onTouchStart={onSheetTouchStart}
            onTouchMove={onSheetTouchMove}
            onTouchEnd={onSheetTouchEnd}
            onTouchCancel={onSheetTouchEnd}
            className="flex touch-none items-center gap-2.5 border-b-2 border-[var(--ink)] py-2 pl-3 pr-2 sm:touch-auto sm:gap-3 sm:py-3"
            style={{ background: def.tint }}
          >
            <span
              aria-hidden
              className="grid h-10 w-10 shrink-0 place-items-center rounded-[var(--radius)] border-2 border-[var(--ink)] bg-white text-[1.4rem] shadow-[var(--shadow-sm)] sm:h-12 sm:w-12 sm:text-[1.6rem]"
            >
              {def.icon}
            </span>
            <div className="min-w-0 flex-1 text-[#23201c]">
              <h1 className="text-[length:var(--text-base)] font-extrabold leading-tight sm:text-[length:var(--text-lg)]">
                {def.label}
              </h1>
              <p className="truncate text-[length:var(--text-2xs)] font-semibold opacity-80 sm:text-[length:var(--text-xs)]">
                {def.hint}
              </p>
            </div>
            {/* 모바일 1-탭 크기 전환 (스와이프 없이도 한 손 조작 가능) */}
            <button
              type="button"
              onClick={() => setSheetSnap((s) => (s === "half" ? "full" : "half"))}
              aria-label={sheetSnap === "half" ? "크게 보기" : "지도와 함께 보기"}
              className="press inline-flex h-10 shrink-0 items-center justify-center rounded-[var(--radius-full)] border-2 border-[var(--ink)] bg-white px-2.5 text-[12px] font-extrabold text-[#23201c] shadow-[var(--shadow-sm)] sm:hidden"
            >
              {sheetSnap === "half" ? "크게 ▲" : "지도 ▼"}
            </button>
            <button
              type="button"
              onClick={() => setSheetOpen(false)}
              aria-label="닫기"
              className="press grid h-10 w-10 shrink-0 place-items-center rounded-[var(--radius-full)] border-2 border-[var(--ink)] bg-white text-[#23201c] shadow-[var(--shadow-sm)] sm:h-11 sm:w-11"
            >
              <Icon name="close" size={20} />
            </button>
          </header>

          <div className="thin-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain">
            {/* 응급실은 장소 목록보다 먼저 — 급한 사람이 스크롤할 여유는 없다 */}
            {def.cards.filter((c) => c === "emergency").map(card)}
            {def.categories.length > 0 && def.list !== false && (
              <PlacesPanel
                res={places.data}
                isLoading={places.isLoading}
                isValidating={places.isValidating}
                error={places.error}
                categories={def.categories}
                onSearchHere={searchHere}
                only={only}
                onOnlyChange={setOnly}
                selectedPlaceId={selectedPlaceId}
                onSelectPlace={handleSelectPlace}
              />
            )}
            {def.cards.filter((c) => c !== "emergency").map(card)}

            {/* 안드로이드 등 설치 가능 환경에서 1-탭 홈 화면 추가 안내 */}
            <InstallHint />

            {/* 숫자가 어디서 왔는지 — 메뉴가 아니라 내용 맨 아래의 안내 한 줄이다 */}
            <p className="px-5 pb-6 pt-2 text-[length:var(--text-xs)] text-[var(--text-muted)]">
              <Link href="/opendata" className="font-bold underline underline-offset-4">
                이 정보는 어디서 왔나요?
              </Link>
            </p>
          </div>
        </aside>
      )}

      {/* 내용을 닫아 지도만 보고 있을 때 다시 펼치는 단추 */}
      {def && !sheetOpen && !bottomCard && (
        <button
          type="button"
          onClick={() => setSheetOpen(true)}
          className="glass press pop-in absolute bottom-[calc(var(--dock-h)+10px)] left-1/2 z-20 flex min-h-[46px] max-w-[calc(100vw-136px)] -translate-x-1/2 items-center gap-2 rounded-[var(--radius-full)] px-4 text-[length:var(--text-sm)] font-extrabold sm:min-h-[48px] sm:max-w-none sm:px-5"
        >
          <span aria-hidden>{def.icon}</span>
          <span className="truncate">{def.label} 다시 보기</span>
        </button>
      )}

      {/*
        하단 메뉴 — 이 앱의 메뉴는 이것이 전부다.
        휴대폰에서는 4칸 두 줄로 여덟 개가 모두 한눈에 보인다. 옆으로 밀어야
        나오는 메뉴는 없는 것과 같다. 넓은 화면에서는 한 줄.
        같은 메뉴를 다시 누르면 닫히고 지도만 남는다.
      */}
      <nav
        aria-label="메뉴"
        className="pointer-events-none absolute inset-x-0 bottom-0 z-40 flex justify-center px-2.5 pb-[calc(8px+env(safe-area-inset-bottom,0px))] sm:px-3 sm:pb-[calc(12px+env(safe-area-inset-bottom,0px))]"
      >
        <ul className="glass pointer-events-auto grid w-full max-w-[640px] grid-cols-4 gap-1 rounded-[var(--radius-xl)] p-1.5 sm:w-auto sm:grid-cols-8 sm:gap-1.5 sm:p-2">
          {MODES.map((m) => {
            const on = m.id === mode;
            return (
              <li key={m.id}>
                <button
                  type="button"
                  onClick={() => toggleMode(m.id)}
                  aria-pressed={on}
                  className={`press flex h-[50px] w-full flex-col items-center justify-center gap-0.5 rounded-[var(--radius)] border-2 sm:h-[64px] sm:w-[68px] ${
                    on
                      ? "border-[var(--ink)] text-[#23201c] shadow-[var(--shadow-sm)]"
                      : "border-transparent hover:bg-[var(--surface-2)]"
                  }`}
                  style={on ? { background: m.tint } : undefined}
                >
                  <span
                    aria-hidden
                    key={on ? "on" : "off"}
                    className={`text-[1.35rem] leading-none sm:text-[1.6rem] ${on ? "wiggle" : ""}`}
                  >
                    {m.icon}
                  </span>
                  <span className="whitespace-nowrap text-[12px] font-extrabold tracking-tight sm:text-[length:var(--text-2xs)]">
                    {m.label}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
