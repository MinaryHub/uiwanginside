"use client";

import { useCallback, useMemo, useRef, useState } from "react";
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
import { useMyLocation } from "@/lib/useMyLocation";
import {
  buildSegments,
  LEVEL_COLOR,
  LEVEL_LABEL,
  type TrafficSegment,
} from "@/lib/traffic";
import type { Cctv, CctvPayload } from "@/lib/cctvTypes";
import { timeAgo } from "@/components/ui";
import type {
  ApiEnvelope,
  Place,
  BusStop,
  Incident,
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
import Link from "next/link";
import Logo from "@/components/Logo";
import Icon from "@/components/Icon";
import SummaryStrip, { type InfoTab } from "@/components/SummaryStrip";
import PlaceDetailCard from "@/components/PlaceDetailCard";
import StopCard from "@/components/StopCard";
import CctvCard from "@/components/CctvCard";
import SearchOverlay from "@/components/SearchOverlay";
import DongCard from "@/components/DongCard";
import MapCard from "@/components/MapCard";
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
const NO_LANDMARKS: typeof LANDMARKS = [];
const NO_SEGMENTS: TrafficSegment[] = [];
const NO_CCTVS: Cctv[] = [];
const NO_BUSES: BusPositionsPayload[] = [];
const NO_PATHS: Record<string, LatLng[]> = {};


const POLL = {
  weather: 10 * 60_000,
  air: 10 * 60_000,
  medical: 10 * 60_000,
  // 응급실 병상은 기관이 몇 분마다 올린다
  emergency: 60_000,
  traffic: 60_000,
  transit: 30_000,
  news: 5 * 60_000,
  // GBIS 는 16초에 한 번만 새 값을 준다 (실측 15.8초). 그보다 자주 물으면 헛조회다.
  busPositions: 16_000,
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
  const [fitBounds, setFitBounds] = useState<LatLngBox | null>(null);
  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(null);
  /**
   * 지도에서 고른 정류소·사고. 장소 선택과 상호 배타다 —
   * 카드가 두 개 겹쳐 뜨면 어느 것을 보고 있는지 알 수 없다.
   */
  const [marker, setMarker] = useState<
    | { kind: "stop"; stop: BusStop }
    | { kind: "incident"; incident: Incident }
    | { kind: "cctv"; cctv: Cctv }
    | null
  >(null);
  const [activeDong, setActiveDong] = useState<string | null>(null);
  const [tracked, setTracked] = useState<{ id: string; name: string } | null>(null);
  const [newsQuery, setNewsQuery] = useState("의왕시");
  const [sheetOpen, setSheetOpen] = useState(!!initial.mode);
  /**
   * 좁히기 — 모드 안에서 한 종류만 볼 때.
   * 지도와 목록이 함께 좁혀져야 해서 여기서 들고 있는다.
   */
  const [only, setOnly] = useState<CategoryKey | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  /** 검색으로 고른 곳 — 지금 목록에 없어도 지도와 카드에 남는다 */
  const [pinned, setPinned] = useState<Place | null>(null);

  const def = mode ? MODE_MAP[mode] : null;

  const dCenter = useDebounced(center, 500);
  const geo = `lat=${dCenter.lat.toFixed(4)}&lng=${dCenter.lng.toFixed(4)}`;

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
    // radius 는 조회에 쓰이지 않으므로 주소에도 싣지 않는다
    () => ({ mode, lat: center.lat, lng: center.lng, level, radius: initial.radius }),
    [mode, center.lat, center.lng, level, initial.radius],
  );
  useSyncUrl(urlState);

  // ── 데이터 ────────────────────────────────────────────
  const needs = (c: CardId) => !!def?.cards.includes(c);

  const places = useSWR<ApiEnvelope<PlacesPayload>>(
    def?.categories.length && searchArea
      ? `/api/places?categories=${def.categories.join(",")}` +
          `&rect=${searchArea.rect}&lat=${searchArea.lat.toFixed(4)}` +
          `&lng=${searchArea.lng.toFixed(4)}`
      : null,
    swrFetcher,
    { keepPreviousData: true, revalidateOnFocus: false },
  );
  const weather = useSWR<ApiEnvelope<WeatherPayload>>("/api/weather", swrFetcher, {
    refreshInterval: POLL.weather,
    keepPreviousData: true,
  });
  const air = useSWR<ApiEnvelope<AirPayload>>("/api/air", swrFetcher, {
    refreshInterval: POLL.air,
    keepPreviousData: true,
  });
  const traffic = useSWR<ApiEnvelope<TrafficPayload>>("/api/traffic", swrFetcher, {
    refreshInterval: POLL.traffic,
    keepPreviousData: true,
  });
  const medical = useSWR<ApiEnvelope<MedicalPayload>>("/api/medical", swrFetcher, {
    refreshInterval: POLL.medical,
    keepPreviousData: true,
  });
  const emergency = useSWR<ApiEnvelope<EmergencyPayload>>(
    needs("emergency") ? "/api/emergency" : null,
    swrFetcher,
    { refreshInterval: POLL.emergency, keepPreviousData: true },
  );
  const transit = useSWR<ApiEnvelope<TransitPayload>>(
    def?.layers.bus || needs("transit") ? `/api/transit?${geo}` : null,
    swrFetcher,
    { refreshInterval: POLL.transit, keepPreviousData: true },
  );
  /*
   * 뉴스는 모드와 무관하게 받는다. 상단 요약줄에 최신 제목을 띄우기
   * 때문이다. 예전에는 생활 모드에서만 받았고, 그 카드가 장소 목록
   * 아래에 있어 사실상 아무도 보지 못했다.
   */
  const news = useSWR<ApiEnvelope<NewsPayload>>(
    `/api/news?q=${encodeURIComponent(newsQuery)}`,
    swrFetcher,
    { refreshInterval: POLL.news, keepPreviousData: true },
  );

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

  const fleetKey = picked.fleet.routes
    .map((r) => `${r.id}:${encodeURIComponent(r.name)}`)
    .join(",");

  const busFleet = useSWR<ApiEnvelope<BusFleetPayload>>(
    fleetKey ? `/api/bus-positions?routes=${fleetKey}` : null,
    swrFetcher,
    { refreshInterval: POLL.busPositions, keepPreviousData: true },
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
    { refreshInterval: POLL.busPositions, keepPreviousData: true },
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

  /** 같은 모드를 다시 누르면 해제되어 둘러보기로 돌아간다 */
  const toggleMode = useCallback((next: ModeId) => {
    setMode((cur) => {
      const off = cur === next;
      setSheetOpen(!off);
      setSelectedPlaceId(null);
      setTracked(null);
      // 모드가 바뀌면 좁히기를 푼다 — 이전 모드의 종류는 여기 없다
      setOnly(null);
      return off ? null : next;
    });
  }, []);

  const toggleDong = useCallback((d: { name: string }) => {
    setActiveDong((cur) => {
      if (cur === d.name) {
        setFitBounds(null);
        return null;
      }
      const box = DONG_BBOX[d.name];
      if (box) setFitBounds({ ...box });
      return d.name;
    });
  }, []);

  /**
   * 휴대폰에서는 시트가 화면을 다 덮는다.
   * 목록에서 무엇을 고르면 상세 카드가 시트 뒤에 깔려 보이지 않았다.
   * 고르는 순간 시트를 접어 지도와 카드를 드러낸다 — 손잡이로 다시 연다.
   */
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
  const pickSearched = useCallback((p: Place) => {
    setPinned(p);
    setMarker(null);
    setSelectedPlaceId(p.id);
    focus(p.lat, p.lng, 250);
    setSheetOpen(false);
  }, [focus]);

  const revealMap = useCallback(() => {
    if (typeof window !== "undefined" && window.innerWidth < 640) setSheetOpen(false);
  }, []);

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

  const selectStop = useCallback(
    (stop: BusStop) => {
      setSelectedPlaceId(null);
      setMarker((cur) => {
        if (cur?.kind === "stop" && cur.stop.stationId === stop.stationId) return null;
        revealMap();
        return { kind: "stop", stop };
      });
    },
    [revealMap],
  );

  const selectIncident = useCallback(
    (incident: Incident) => {
      setSelectedPlaceId(null);
      setMarker((cur) => {
        if (cur?.kind === "incident" && cur.incident.id === incident.id) return null;
        revealMap();
        return { kind: "incident", incident };
      });
    },
    [revealMap],
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

  const markerId =
    marker?.kind === "stop"
      ? `stop:${marker.stop.stationId}`
      : marker?.kind === "incident"
        ? `incident:${marker.incident.id}`
        : marker?.kind === "cctv"
          ? `cctv:${marker.cctv.id}`
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
    const narrowed = only ? basePlaces.filter((p) => p.category === only) : basePlaces;
    // 검색으로 고른 곳은 좁히기와 무관하게 남긴다 — 방금 찾은 것이 사라지면 당황한다
    return pinned && !narrowed.some((p) => p.id === pinned.id)
      ? [...narrowed, pinned]
      : narrowed;
  }, [basePlaces, pinned, only]);
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

  // ── 시트 내용 ─────────────────────────────────────────
  const card = (id: CardId) => {
    switch (id) {
      case "emergency":
        return <EmergencyPanel key={id} res={emergency.data} isLoading={emergency.isLoading} />;
      case "weather":
        return <WeatherPanel key={id} res={weather.data} isLoading={weather.isLoading} />;
      case "air":
        return <AirPanel key={id} res={air.data} isLoading={air.isLoading} />;
      case "medical":
        return (
          <MedicalPanel
            key={id}
            res={medical.data}
            isLoading={medical.isLoading}
            onFocus={(lat, lng) => focus(lat, lng, 250)}
          />
        );
      case "traffic":
        return (
          <TrafficPanel
            key={id}
            res={traffic.data}
            isLoading={traffic.isLoading}
            onFocus={(lat, lng) => focus(lat, lng, 500)}
          />
        );
      case "cctv":
        return (
          <CctvPanel
            key={id}
            res={cctv.data}
            isLoading={cctv.isLoading}
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
            onFocus={(lat, lng) => focus(lat, lng, 250)}
            trackedRouteId={tracked?.id ?? null}
            onTrackRoute={(rid, name) =>
              setTracked((cur) => (cur?.id === rid ? null : { id: rid, name }))
            }
          />
        );
      case "waste":
        return <WastePanel key={id} />;
      case "population":
        return (
          <PopulationPanel key={id} onSelectDong={toggleDong} activeDong={activeDong} />
        );
      case "news":
        return (
          <NewsPanel
            key={id}
            res={news.data}
            isLoading={news.isLoading}
            query={newsQuery}
            onQueryChange={setNewsQuery}
          />
        );
    }
  };

  /** 지도 위에 떠 있는 버튼 공통 스타일 */
  const mapBtn = "glass map-btn press";

  /** 요약줄 칸 → 메뉴. 요약줄은 메뉴로 가는 지름길일 뿐, 따로 열리는 창이 없다 */
  const TAB_MODE: Record<InfoTab, ModeId> = {
    weather: "weather",
    air: "weather",
    news: "news",
    traffic: "transit",
    medical: "medical",
    waste: "waste",
    population: "dong",
  };
  const openTab: InfoTab | null =
    mode === "weather"
      ? "weather"
      : mode === "news"
        ? "news"
        : mode === "transit"
          ? "traffic"
          : mode === "medical"
            ? "medical"
            : null;
  const openFromSummary = (t: InfoTab) => toggleMode(TAB_MODE[t]);

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
      {/* 지도 — 화면 전체 */}
      <div className="dots absolute inset-0">
        <KakaoMap
          appKey={appKey}
          center={center}
          level={level}
          places={mapPlaces}
          incidents={mapIncidents}
          busStops={mapStops}
          medicalOpen={medicalMarkers}
          busPositions={mapBusPositions}
          busPaths={busRoutePaths.data?.data.paths ?? NO_PATHS}
          landmarks={mapLandmarks}
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
      <header className="pointer-events-none absolute inset-x-0 top-0 z-40 p-3">
        <div className="flex items-center gap-2">
          <div className="glass pointer-events-auto flex h-12 min-w-0 flex-1 items-center gap-2 rounded-[var(--radius-full)] pl-1.5 pr-2">
            <button
              type="button"
              onClick={() => {
                setMode(null);
                setSheetOpen(false);
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

        <div className="glass pointer-events-auto mt-2 flex h-11 items-center overflow-hidden rounded-[var(--radius-full)] px-1.5 sm:hidden">
          {summary}
        </div>
      </header>

      {/*
        지도 컨트롤 — 내 위치와 확대·축소만. 동 고르기는 '우리 동네' 메뉴로
        옮겼다. 메뉴 안에 또 메뉴를 두지 않는다.
      */}
      <div className="absolute right-3 top-[128px] z-20 flex flex-col gap-2.5 sm:top-[76px]">
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
        위치 안내. 권한 거부나 '의왕 밖' 같은 것은 눌러본 사람만 알면
        되는 이야기라 잠깐 떴다 사라지는 자리에 둔다.
      */}
      {locNotice && (
        <div className="pointer-events-none absolute inset-x-0 top-[128px] z-40 flex justify-center px-16 sm:top-[76px]">
          <button
            type="button"
            onClick={() => setLocNotice(null)}
            className="glass pop-in pointer-events-auto max-w-[420px] rounded-[var(--radius-lg)] px-4 py-2.5 text-[length:var(--text-sm)] font-bold"
          >
            {locNotice} <span className="text-[var(--text-faint)]">✕</span>
          </button>
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
          stop={marker.stop}
          trackedRouteId={tracked?.id ?? null}
          onTrackRoute={(rid, name) =>
            setTracked((cur) => (cur?.id === rid ? null : { id: rid, name }))
          }
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
        위로는 상단 바, 아래로는 메뉴를 가리지 않는다. 지금 무엇을 보고
        있는지(메뉴)와 오늘 날씨(상단)가 늘 보여야 한다.
      */}
      {def && sheetOpen && (
        <aside
          key={def.id}
          aria-label={def.label}
          className="pop-in absolute inset-x-3 bottom-[calc(var(--dock-h)+6px)] top-[128px] z-30 flex flex-col overflow-hidden rounded-[var(--radius-xl)] border-2 border-[var(--ink)] bg-[var(--surface)] shadow-[var(--shadow-lg)] sm:right-auto sm:top-[76px] sm:w-[400px]"
        >
          <header
            className="flex items-center gap-3 border-b-2 border-[var(--ink)] py-3 pl-3 pr-2"
            style={{ background: def.tint }}
          >
            <span
              aria-hidden
              className="grid h-12 w-12 shrink-0 place-items-center rounded-[var(--radius)] border-2 border-[var(--ink)] bg-white text-[1.6rem] shadow-[var(--shadow-sm)]"
            >
              {def.icon}
            </span>
            <div className="min-w-0 flex-1 text-[#23201c]">
              <h1 className="text-[length:var(--text-lg)] font-extrabold leading-tight">
                {def.label}
              </h1>
              <p className="truncate text-[length:var(--text-xs)] font-semibold opacity-80">
                {def.hint}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setSheetOpen(false)}
              aria-label="닫기"
              className="press grid h-11 w-11 shrink-0 place-items-center rounded-[var(--radius-full)] border-2 border-[var(--ink)] bg-white text-[#23201c] shadow-[var(--shadow-sm)]"
            >
              <Icon name="close" size={20} />
            </button>
          </header>

          <div className="thin-scroll min-h-0 flex-1 overflow-y-auto">
            {/* 응급실은 장소 목록보다 먼저 — 급한 사람이 스크롤할 여유는 없다 */}
            {def.cards.filter((c) => c === "emergency").map(card)}
            {def.categories.length > 0 && (
              <PlacesPanel
                res={places.data}
                isLoading={places.isLoading}
                categories={def.categories}
                onSearchHere={searchHere}
                only={only}
                onOnlyChange={setOnly}
                selectedPlaceId={selectedPlaceId}
                onSelectPlace={handleSelectPlace}
              />
            )}
            {def.cards.filter((c) => c !== "emergency").map(card)}

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
          className="glass press pop-in absolute bottom-[calc(var(--dock-h)+10px)] left-1/2 z-20 flex min-h-[48px] -translate-x-1/2 items-center gap-2 rounded-[var(--radius-full)] px-5 text-[length:var(--text-sm)] font-extrabold"
        >
          <span aria-hidden>{def.icon}</span>
          {def.label} 다시 보기
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
        className="pointer-events-none absolute inset-x-0 bottom-0 z-40 flex justify-center px-3 pb-[calc(12px+env(safe-area-inset-bottom,0px))]"
      >
        <ul className="glass pointer-events-auto grid w-full max-w-[640px] grid-cols-4 gap-1.5 rounded-[var(--radius-xl)] p-2 sm:w-auto sm:grid-cols-8">
          {MODES.map((m) => {
            const on = m.id === mode;
            return (
              <li key={m.id}>
                <button
                  type="button"
                  onClick={() => toggleMode(m.id)}
                  aria-pressed={on}
                  className={`press flex h-[56px] w-full flex-col items-center justify-center gap-0.5 rounded-[var(--radius)] border-2 sm:h-[64px] sm:w-[68px] ${
                    on
                      ? "border-[var(--ink)] text-[#23201c] shadow-[var(--shadow-sm)]"
                      : "border-transparent hover:bg-[var(--surface-2)]"
                  }`}
                  style={on ? { background: m.tint } : undefined}
                >
                  <span
                    aria-hidden
                    key={on ? "on" : "off"}
                    className={`text-[1.45rem] leading-none sm:text-[1.6rem] ${on ? "wiggle" : ""}`}
                  >
                    {m.icon}
                  </span>
                  <span className="whitespace-nowrap text-[length:var(--text-2xs)] font-extrabold tracking-tight">
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
