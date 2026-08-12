"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import useSWR from "swr";
import { swrFetcher } from "@/lib/fetcher";
import { useDebounced } from "@/lib/useDebounced";
import { parseUrlState, useSyncUrl, shareUrl } from "@/lib/urlState";
import { UIWANG, DONGS, LANDMARKS } from "@/lib/uiwang";
import { UIWANG_BBOX } from "@/lib/uiwang-boundary";
import { DONG_BBOX, type LatLngBox } from "@/lib/dong-boundaries";
import { MODES, MODE_MAP, type ModeId, type CardId } from "@/lib/modes";
import { getDeviceId } from "@/lib/deviceId";
import type { Photo, PhotosPayload } from "@/lib/photoTypes";
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
  NewsPayload,
  TrafficPayload,
  TransitPayload,
  RatingsPayload,
  BusPositionsPayload,
} from "@/lib/types";
import Link from "next/link";
import Logo from "@/components/Logo";
import SummaryStrip from "@/components/SummaryStrip";
import PlaceDetailCard from "@/components/PlaceDetailCard";
import StopCard from "@/components/StopCard";
import MapCard from "@/components/MapCard";
import PlacesPanel from "@/components/panels/PlacesPanel";
import WeatherPanel from "@/components/panels/WeatherPanel";
import AirPanel from "@/components/panels/AirPanel";
import MedicalPanel from "@/components/panels/MedicalPanel";
import TrafficPanel from "@/components/panels/TrafficPanel";
import TransitPanel from "@/components/panels/TransitPanel";
import NewsPanel from "@/components/panels/NewsPanel";
import WastePanel from "@/components/panels/WastePanel";
import PopulationPanel from "@/components/panels/PopulationPanel";
import RatingPanel from "@/components/panels/RatingPanel";

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
const NO_PHOTOS: Photo[] = [];

const POLL = {
  weather: 10 * 60_000,
  air: 10 * 60_000,
  medical: 10 * 60_000,
  traffic: 60_000,
  transit: 30_000,
  news: 5 * 60_000,
  busPositions: 15_000,
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
  const [radius, setRadius] = useState<number>(initial.radius);
  const [fitBounds, setFitBounds] = useState<LatLngBox | null>(null);
  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(null);
  /**
   * 지도에서 고른 정류소·사고. 장소 선택과 상호 배타다 —
   * 카드가 두 개 겹쳐 뜨면 어느 것을 보고 있는지 알 수 없다.
   */
  const [marker, setMarker] = useState<
    { kind: "stop"; stop: BusStop } | { kind: "incident"; incident: Incident } | null
  >(null);
  const [activeDong, setActiveDong] = useState<string | null>(null);
  const [tracked, setTracked] = useState<{ id: string; name: string } | null>(null);
  const [newsQuery, setNewsQuery] = useState("의왕시");
  const [sheetOpen, setSheetOpen] = useState(!!initial.mode);
  const [dongMenu, setDongMenu] = useState(false);
  const [copied, setCopied] = useState(false);

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

  const onBoundsChanged = useCallback(
    (rect: string, c: { lat: number; lng: number }, lv: number) => {
      // 손가락으로 벌려 확대하면 지도만 바뀌고 상태는 그대로였다.
      // 이름표를 붙일지 정하는 기준과 주소창이 옛 값을 보고 있었다.
      setLevel(lv);

      const prev = areaRef.current;
      let refresh = !prev || prev.level !== lv;

      if (!refresh && prev) {
        const [aMinX, aMinY, aMaxX, aMaxY] = prev.rect.split(",").map(Number);
        const [bMinX, bMinY, bMaxX, bMaxY] = rect.split(",").map(Number);
        const w = bMaxX - bMinX;
        const h = bMaxY - bMinY;
        // 가로·세로 어느 쪽으로든 화면의 절반을 넘게 움직였으면 새로 찾는다
        const movedX = Math.abs((bMinX + bMaxX) / 2 - (aMinX + aMaxX) / 2);
        const movedY = Math.abs((bMinY + bMaxY) / 2 - (aMinY + aMaxY) / 2);
        refresh = movedX > w * 0.5 || movedY > h * 0.5;
      }

      if (refresh) {
        areaRef.current = { rect, level: lv };
        setSearchArea({ rect, lat: c.lat, lng: c.lng });
      }
    },
    [],
  );

  const urlState = useMemo(
    () => ({ mode, lat: center.lat, lng: center.lng, level, radius }),
    [mode, center.lat, center.lng, level, radius],
  );
  useSyncUrl(urlState);

  const share = useCallback(async () => {
    const url = shareUrl(urlState);
    try {
      if (navigator.share) await navigator.share({ title: "의왕 인사이드", url });
      else await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* 사용자가 공유를 취소한 경우 */
    }
  }, [urlState]);

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
  const transit = useSWR<ApiEnvelope<TransitPayload>>(
    def?.layers.bus || needs("transit") ? `/api/transit?${geo}` : null,
    swrFetcher,
    { refreshInterval: POLL.transit, keepPreviousData: true },
  );
  const news = useSWR<ApiEnvelope<NewsPayload>>(
    needs("news") ? `/api/news?q=${encodeURIComponent(newsQuery)}` : null,
    swrFetcher,
    { refreshInterval: POLL.news, keepPreviousData: true },
  );

  const placeList = useMemo(() => places.data?.data.places ?? [], [places.data]);

  const ratings = useSWR<ApiEnvelope<RatingsPayload>>(
    mode === "food" && placeList.length > 0
      ? `/api/ratings?placeIds=${placeList
          .slice(0, 120)
          .map((p) => p.id)
          .join(",")}&deviceId=${encodeURIComponent(getDeviceId())}`
      : null,
    swrFetcher,
    { keepPreviousData: true, revalidateOnFocus: false },
  );

  const busPositions = useSWR<ApiEnvelope<BusPositionsPayload>>(
    tracked
      ? `/api/bus-positions?routeId=${tracked.id}&routeName=${encodeURIComponent(tracked.name)}`
      : null,
    swrFetcher,
    { refreshInterval: POLL.busPositions, keepPreviousData: true },
  );

  /** 내 사진. 로그인하지 않았으면 서버가 빈 목록을 준다. */
  const myPhotos = useSWR<ApiEnvelope<PhotosPayload>>("/api/photos", swrFetcher, {
    revalidateOnFocus: false,
  });
  const mapPhotos = myPhotos.data?.data.photos ?? NO_PHOTOS;
  const [photo, setPhoto] = useState<Photo | null>(null);

  const refreshAll = useCallback(() => {
    [places, weather, air, traffic, medical, transit, news, ratings].forEach((s) =>
      s.mutate(),
    );
  }, [places, weather, air, traffic, medical, transit, news, ratings]);

  // ── 동작 ──────────────────────────────────────────────
  const focus = useCallback((lat: number, lng: number, lv = 4) => {
    setFitBounds(null);
    setCenter({ lat, lng });
    setLevel(lv);
  }, []);

  /** 같은 모드를 다시 누르면 해제되어 둘러보기로 돌아간다 */
  const toggleMode = useCallback((next: ModeId) => {
    setMode((cur) => {
      const off = cur === next;
      setSheetOpen(!off);
      setSelectedPlaceId(null);
      setTracked(null);
      return off ? null : next;
    });
  }, []);

  const toggleDong = useCallback((d: { name: string }) => {
    setDongMenu(false);
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

  const handleSelectPlace = useCallback((p: Place) => {
    setMarker(null);
    setSelectedPlaceId((id) => {
      if (id === p.id) return null;
      setFitBounds(null);
      setCenter({ lat: p.lat, lng: p.lng });
      setLevel((lv) => Math.min(lv, 4));
      return p.id;
    });
  }, []);

  /** 등록 결과를 SWR 캐시에 바로 반영한다 (재조회 없이) */
  const applyRating = useCallback(
    (placeId: string, r: RatingsPayload["ratings"][string]) => {
      ratings.mutate(
        (cur) =>
          cur && {
            ...cur,
            data: { ...cur.data, ratings: { ...cur.data.ratings, [placeId]: r } },
          },
        { revalidate: false },
      );
    },
    [ratings],
  );

  const selectStop = useCallback((stop: BusStop) => {
    setSelectedPlaceId(null);
    setMarker((cur) =>
      cur?.kind === "stop" && cur.stop.stationId === stop.stationId
        ? null
        : { kind: "stop", stop },
    );
  }, []);

  const selectIncident = useCallback((incident: Incident) => {
    setSelectedPlaceId(null);
    setMarker((cur) =>
      cur?.kind === "incident" && cur.incident.id === incident.id
        ? null
        : { kind: "incident", incident },
    );
  }, []);

  const markerId =
    marker?.kind === "stop"
      ? `stop:${marker.stop.stationId}`
      : marker?.kind === "incident"
        ? `incident:${marker.incident.id}`
        : null;

  const selectedPlace = useMemo(
    () => placeList.find((p) => p.id === selectedPlaceId) ?? null,
    [placeList, selectedPlaceId],
  );

  const mapPlaces = def?.layers.places ? placeList : NO_PLACES;
  const mapIncidents = def?.layers.incidents
    ? (traffic.data?.data.incidents ?? NO_INCIDENTS)
    : NO_INCIDENTS;
  const mapStops = def?.layers.bus ? (transit.data?.data.stops ?? NO_STOPS) : NO_STOPS;
  const mapLandmarks = mode === null ? LANDMARKS : NO_LANDMARKS;
  const mapBusPositions = busPositions.data?.ok ? busPositions.data.data : null;

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
      case "rating":
        return (
          <RatingPanel
            key={id}
            ratings={ratings.data?.data.ratings ?? {}}
            places={placeList}
            selectedId={selectedPlaceId}
            onSelectPlace={handleSelectPlace}
          />
        );
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
            onFocus={(lat, lng) => focus(lat, lng, 3)}
          />
        );
      case "traffic":
        return (
          <TrafficPanel
            key={id}
            res={traffic.data}
            isLoading={traffic.isLoading}
            onFocus={(lat, lng) => focus(lat, lng, 4)}
          />
        );
      case "transit":
        return (
          <TransitPanel
            key={id}
            res={transit.data}
            isLoading={transit.isLoading}
            onFocus={(lat, lng) => focus(lat, lng, 3)}
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
  const mapBtn =
    "grid h-10 w-10 place-items-center rounded-[var(--radius)] border border-[var(--border)] " +
    "bg-[var(--surface)]/92 text-[var(--text-base)] font-bold shadow-[var(--shadow-md)] " +
    "backdrop-blur transition hover:border-[var(--brand)] hover:text-[var(--brand)]";

  return (
    <div className="relative h-dvh overflow-hidden bg-[var(--bg)]">
      {/* 지도 — 화면 전체 */}
      <div className="absolute inset-0">
        <KakaoMap
          appKey={appKey}
          center={center}
          level={level}
          places={mapPlaces}
          incidents={mapIncidents}
          busStops={mapStops}
          medicalOpen={medicalMarkers}
          photos={mapPhotos}
          onSelectPhoto={setPhoto}
          busPositions={mapBusPositions}
          landmarks={mapLandmarks}
          showBoundary
          activeDong={activeDong}
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

      {/* 상단 바 — 이름과 오늘 요약만 */}
      <header className="pointer-events-none absolute inset-x-0 top-0 z-30 flex items-center gap-2 p-3">
        <div className="pointer-events-auto flex min-w-0 flex-1 items-center gap-2 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)]/92 px-3 py-2 shadow-[var(--shadow-md)] backdrop-blur">
          <button
            type="button"
            onClick={() => {
              setMode(null);
              setSheetOpen(false);
            }}
            className="flex shrink-0 items-center gap-1.5"
            title="둘러보기로"
          >
            <Logo size={24} />
            <span className="text-[var(--text-base)] font-extrabold tracking-tight">
              의왕
            </span>
          </button>
          <span className="h-4 w-px shrink-0 bg-[var(--border)]" />
          <div className="min-w-0 flex-1">
            <SummaryStrip
              weather={weather.data}
              air={air.data}
              traffic={traffic.data}
              medical={medical.data}
              onOpen={(m) => {
                setMode(m);
                setSheetOpen(true);
              }}
            />
          </div>
        </div>

        <Link
          href="/lists"
          title="내 리스트"
          aria-label="내 리스트"
          className={`pointer-events-auto ${mapBtn}`}
        >
          ☰
        </Link>
        <Link
          href="/gallery"
          title="내 사진"
          aria-label="내 사진"
          className={`pointer-events-auto ${mapBtn}`}
        >
          ▣
        </Link>
        <button
          type="button"
          onClick={share}
          title="현재 화면 공유"
          aria-label="현재 화면 공유"
          className={`pointer-events-auto ${mapBtn}`}
        >
          {copied ? "✓" : "↗"}
        </button>
        <button
          type="button"
          onClick={refreshAll}
          title="새로고침"
          aria-label="새로고침"
          className={`pointer-events-auto ${mapBtn}`}
        >
          ↻
        </button>
      </header>

      {/* 모드 — 탭 바를 없애고 지도 위 알약으로 */}
      <nav
        className="pointer-events-none absolute inset-x-0 top-[64px] z-20 flex justify-center px-3"
        aria-label="보기 모드"
      >
        <div className="pointer-events-auto flex gap-1 rounded-[var(--radius-full)] border border-[var(--border)] bg-[var(--surface)]/92 p-1 shadow-[var(--shadow-md)] backdrop-blur">
          {MODES.map((m) => {
            const on = m.id === mode;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => toggleMode(m.id)}
                aria-pressed={on}
                className="min-h-[36px] rounded-[var(--radius-full)] px-3.5 text-[var(--text-sm)] font-bold transition"
                style={
                  on
                    ? { background: "var(--brand)", color: "var(--on-brand)" }
                    : { color: "var(--text-muted)" }
                }
              >
                {m.label}
              </button>
            );
          })}
        </div>
      </nav>

      {/* 지도 컨트롤 */}
      <div className="absolute bottom-4 right-3 z-20 flex flex-col gap-1.5">
        <div className="relative">
          <button
            type="button"
            onClick={() => setDongMenu((v) => !v)}
            aria-expanded={dongMenu}
            title="동으로 이동"
            className={mapBtn}
            style={
              activeDong ? { color: "var(--info)", borderColor: "var(--info)" } : undefined
            }
          >
            동
          </button>
          {dongMenu && (
            <div className="fade-up absolute bottom-0 right-12 w-32 overflow-hidden rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-lg)]">
              {DONGS.map((d) => (
                <button
                  key={d.name}
                  type="button"
                  onClick={() => toggleDong(d)}
                  className="block min-h-[40px] w-full px-3 text-left text-[var(--text-sm)] font-semibold transition hover:bg-[var(--surface-2)]"
                  style={activeDong === d.name ? { color: "var(--info)" } : undefined}
                >
                  {d.name}
                </button>
              ))}
              <button
                type="button"
                onClick={() => {
                  setActiveDong(null);
                  setFitBounds({ ...UIWANG_BBOX });
                  setDongMenu(false);
                }}
                className="block min-h-[40px] w-full border-t border-[var(--border)] px-3 text-left text-[var(--text-sm)] font-semibold text-[var(--text-muted)] transition hover:bg-[var(--surface-2)]"
              >
                의왕시 전체
              </button>
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={() => focus(UIWANG.center.lat, UIWANG.center.lng, 5)}
          title="의왕시청으로"
          aria-label="의왕시청으로"
          className={mapBtn}
        >
          ⌖
        </button>
        <button
          type="button"
          onClick={() => setLevel((l) => Math.max(1, l - 1))}
          aria-label="확대"
          className={mapBtn}
        >
          +
        </button>
        <button
          type="button"
          onClick={() => setLevel((l) => Math.min(12, l + 1))}
          aria-label="축소"
          className={mapBtn}
        >
          −
        </button>
      </div>

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
          <p className="mt-3 text-[var(--text-sm)] leading-relaxed">
            {marker.incident.message}
          </p>
          <p className="mt-2 text-[var(--text-2xs)] text-[var(--text-faint)]">
            {timeAgo(marker.incident.startedAt)} 접수
          </p>
        </MapCard>
      )}

      {photo && (
        <MapCard
          key={photo.id}
          title={photo.caption || "내 사진"}
          subtitle={new Date(photo.takenAt ?? photo.createdAt).toLocaleDateString("ko-KR", {
            year: "numeric",
            month: "long",
            day: "numeric",
            timeZone: "Asia/Seoul",
          })}
          onClose={() => setPhoto(null)}
        >
          {/* 원본을 그대로 쓴다 — Blob URL 은 next/image 최적화 대상이 아니다 */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={photo.url}
            alt={photo.caption ?? "내 사진"}
            className="mt-3 max-h-[40vh] w-full rounded-[var(--radius)] object-contain"
          />
          <Link
            href="/gallery"
            className="mt-3 inline-flex min-h-[40px] items-center text-[var(--text-xs)] font-bold text-[var(--brand)] underline underline-offset-4"
          >
            갤러리에서 관리
          </Link>
        </MapCard>
      )}

      {selectedPlace && (
        <PlaceDetailCard
          key={selectedPlace.id}
          place={selectedPlace}
          rating={ratings.data?.data.ratings[selectedPlace.id]}
          showRating={mode === "food"}
          onClose={() => setSelectedPlaceId(null)}
          onRated={applyRating}
        />
      )}

      {/* 시트 — 좌우 두 패널을 하나로 합쳤다 */}
      {def && (
        <aside
          className={`absolute inset-y-0 left-0 z-30 flex w-full flex-col border-r border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-lg)] transition-transform duration-200 sm:w-[360px] ${
            sheetOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <header className="flex items-center gap-2 border-b border-[var(--border)] px-4 py-3">
            <div className="min-w-0 flex-1">
              <h1 className="text-[var(--text-base)] font-extrabold">{def.label}</h1>
              <p className="truncate text-[var(--text-2xs)] text-[var(--text-faint)]">
                {def.hint}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setSheetOpen(false)}
              aria-label="목록 닫기"
              className="grid h-10 w-10 shrink-0 place-items-center rounded-[var(--radius)] text-[var(--text-base)] text-[var(--text-muted)] transition hover:bg-[var(--surface-2)]"
            >
              ✕
            </button>
          </header>

          <div className="thin-scroll min-h-0 flex-1 overflow-y-auto">
            {def.categories.length > 0 && (
              <PlacesPanel
                res={places.data}
                isLoading={places.isLoading}
                categories={def.categories}
                radius={radius}
                onRadiusChange={setRadius}
                selectedPlaceId={selectedPlaceId}
                onSelectPlace={handleSelectPlace}
              />
            )}
            {def.cards.map(card)}
          </div>
        </aside>
      )}

      {/* 시트를 닫아둔 상태에서 다시 여는 손잡이 */}
      {def && !sheetOpen && (
        <button
          type="button"
          onClick={() => setSheetOpen(true)}
          aria-label={`${def.label} 목록 열기`}
          className="absolute left-0 top-1/2 z-20 -translate-y-1/2 rounded-r-[var(--radius)] border border-l-0 border-[var(--border)] bg-[var(--surface)]/92 px-2 py-5 text-[var(--text-sm)] font-bold shadow-[var(--shadow-md)] backdrop-blur"
        >
          ›
        </button>
      )}
    </div>
  );
}
