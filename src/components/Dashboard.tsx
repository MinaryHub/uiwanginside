"use client";

import { useCallback, useMemo, useState } from "react";
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
import type {
  ApiEnvelope,
  Place,
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
import SummaryStrip from "@/components/SummaryStrip";
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
import PlaceDetailCard from "@/components/PlaceDetailCard";
import { getDeviceId } from "@/lib/deviceId";

const KakaoMap = dynamic(() => import("@/components/KakaoMap"), { ssr: false });

/** 폴링 주기 (ms) */
const POLL = {
  weather: 10 * 60_000,
  air: 10 * 60_000,
  medical: 10 * 60_000,
  traffic: 60_000,
  transit: 30_000,
  news: 5 * 60_000,
  /** TAGO 갱신 주기가 10~20초라 그보다 자주 부를 이유가 없다 */
  busPositions: 15_000,
};

type MobileTab = "map" | "list" | "info";

export default function Dashboard({ appKey }: { appKey?: string }) {
  const initial = parseUrlState(useSearchParams());

  const [mode, setMode] = useState<ModeId>(initial.mode);
  const [center, setCenter] = useState({ lat: initial.lat, lng: initial.lng });
  const [level, setLevel] = useState(initial.level);
  const [radius, setRadius] = useState<number>(initial.radius);
  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(null);
  const [newsQuery, setNewsQuery] = useState("의왕시");
  const [tab, setTab] = useState<MobileTab>("map");
  const [showBoundary, setShowBoundary] = useState(true);
  const [activeDong, setActiveDong] = useState<string | null>(null);
  /** 이 범위가 화면에 다 들어오도록 맞춘다 (동 전체보기 등) */
  const [fitBounds, setFitBounds] = useState<LatLngBox | null>(null);
  /** 지도에 실시간 위치를 표시할 노선 */
  const [tracked, setTracked] = useState<{ id: string; name: string } | null>(null);

  const def = MODE_MAP[mode];

  // 조작 도중 값이 그대로 SWR 키가 되면 중간값마다 요청이 나간다
  const dCenter = useDebounced(center, 500);
  const dRadius = useDebounced(radius, 500);
  const geo = `lat=${dCenter.lat.toFixed(4)}&lng=${dCenter.lng.toFixed(4)}`;

  const urlState = useMemo(
    () => ({ mode, lat: center.lat, lng: center.lng, level, radius }),
    [mode, center.lat, center.lng, level, radius],
  );
  useSyncUrl(urlState);

  const [copied, setCopied] = useState(false);
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
  // 모드가 쓰지 않는 데이터는 아예 요청하지 않는다 (SWR 키를 null 로)
  const needs = (c: CardId) => def.cards.includes(c);

  const places = useSWR<ApiEnvelope<PlacesPayload>>(
    def.categories.length
      ? `/api/places?categories=${def.categories.join(",")}&${geo}&radius=${dRadius}`
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
    def.layers.bus || needs("transit") ? `/api/transit?${geo}` : null,
    swrFetcher,
    { refreshInterval: POLL.transit, keepPreviousData: true },
  );
  const news = useSWR<ApiEnvelope<NewsPayload>>(
    needs("news") ? `/api/news?q=${encodeURIComponent(newsQuery)}` : null,
    swrFetcher,
    { refreshInterval: POLL.news, keepPreviousData: true },
  );

  /** 지금 화면에 있는 가게들의 별점만 조회한다 */
  const placeList = useMemo(() => places.data?.data.places ?? [], [places.data]);
  const ratingKey =
    mode === "food" && placeList.length > 0
      ? `/api/ratings?placeIds=${placeList.slice(0, 120).map((p) => p.id).join(",")}` +
        `&deviceId=${encodeURIComponent(getDeviceId())}`
      : null;
  const ratings = useSWR<ApiEnvelope<RatingsPayload>>(ratingKey, swrFetcher, {
    keepPreviousData: true,
    revalidateOnFocus: false,
  });

  const busPositions = useSWR<ApiEnvelope<BusPositionsPayload>>(
    tracked
      ? `/api/bus-positions?routeId=${tracked.id}&routeName=${encodeURIComponent(tracked.name)}`
      : null,
    swrFetcher,
    { refreshInterval: POLL.busPositions, keepPreviousData: true },
  );

  const refreshAll = useCallback(() => {
    [places, weather, air, traffic, medical, transit, news].forEach((s) => s.mutate());
  }, [places, weather, air, traffic, medical, transit, news]);

  // ── 동작 ──────────────────────────────────────────────
  const focus = useCallback((lat: number, lng: number, lv = 4) => {
    // 특정 지점으로 가는 동작이므로 진행 중인 범위 맞춤은 취소한다
    setFitBounds(null);
    setCenter({ lat, lng });
    setLevel(lv);
    setTab("map");
  }, []);

  /**
   * 모드는 "무엇을 보여줄지" 만 바꾼다. "어디를 보고 있는지" 는 그대로 둔다.
   *
   * 예전에는 모드마다 정해진 확대 수준으로 되돌려서, 청계동을 들여다보다
   * 맛집을 누르면 화면이 튀었다. 지금 보고 있는 동네의 맛집을 보려는 것이므로
   * 중심·확대·동 강조를 유지하고 목록만 새 카테고리로 바꾼다.
   * 시야를 넓히려면 지도 우측의 전체보기 버튼을 쓴다.
   */
  const changeMode = useCallback((next: ModeId) => {
    setMode(next);
    setSelectedPlaceId(null);
    setTracked(null);
    setTab("map");
  }, []);

  /**
   * 동을 누르면 경계를 강조하고 동 전체가 화면에 들어오도록 맞춘다.
   * 동마다 면적이 4배 넘게 차이나(청계동 22km² vs 내손2동 2.5km²) 고정 확대
   * 수준으로는 어떤 동은 잘리고 어떤 동은 너무 작게 보인다.
   * 같은 동을 다시 누르면 해제한다.
   */
  const toggleDong = useCallback((d: { name: string }) => {
    setActiveDong((cur) => {
      if (cur === d.name) {
        setFitBounds(null);
        return null;
      }
      const box = DONG_BBOX[d.name];
      // 새 객체로 넘겨야 같은 동을 다시 골랐을 때도 다시 맞춰진다
      if (box) setFitBounds({ ...box });
      setTab("map");
      return d.name;
    });
  }, []);

  const handleSelectPlace = useCallback(
    (p: Place) => {
      setSelectedPlaceId((id) => {
        if (id === p.id) return null;
        // 이미 충분히 가까우면 확대를 건드리지 않는다.
        // 고를 때마다 훅 당기면 주변 가게와 비교하던 맥락을 잃는다.
        setFitBounds(null);
        setCenter({ lat: p.lat, lng: p.lng });
        setLevel((lv) => Math.min(lv, 4));
        setTab("map");
        return p.id;
      });
    },
    [],
  );

  const selectedPlace = useMemo(
    () => placeList.find((p) => p.id === selectedPlaceId) ?? null,
    [placeList, selectedPlaceId],
  );

  /** 의료 모드에서는 "진료중" 인 곳을 지도에 함께 띄운다 */
  const medicalMarkers = useMemo(
    () =>
      mode === "medical"
        ? (medical.data?.data.places ?? []).filter(
            (p) => p.openNow === true && p.lat != null && p.lng != null,
          )
        : [],
    [mode, medical.data],
  );

  const unavailableCount = [places, weather, air, medical, traffic, transit, news].filter(
    (s) => s.data && s.data.ok === false,
  ).length;

  // ── 카드 렌더 ─────────────────────────────────────────
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
            onTrackRoute={(id, name) =>
              setTracked((cur) => (cur?.id === id ? null : { id, name }))
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

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      {/* ── 헤더: 이름 + 오늘 요약 ─────────────────────── */}
      <header className="z-30 flex shrink-0 items-center gap-3 border-b border-[var(--border)] bg-[var(--surface)] px-4 py-2.5">
        <button
          type="button"
          onClick={() => changeMode("explore")}
          className="flex shrink-0 items-center gap-1.5"
        >
          <span className="grid h-8 w-8 place-items-center rounded-[var(--radius)] bg-[var(--brand)] text-[1.05rem]">
            🏙️
          </span>
          <span className="hidden text-[var(--text-base)] font-extrabold sm:block">
            의왕 인사이드
          </span>
        </button>

        <span className="h-4 w-px shrink-0 bg-[var(--border)]" />

        <div className="min-w-0 flex-1">
          <SummaryStrip
            weather={weather.data}
            air={air.data}
            traffic={traffic.data}
            medical={medical.data}
            onOpen={changeMode}
          />
        </div>

        <button
          type="button"
          onClick={share}
          title="현재 화면 공유"
          aria-label="현재 화면 공유"
          className="grid h-11 w-11 shrink-0 place-items-center rounded-[var(--radius)] border border-[var(--border)] text-[var(--text-base)] transition hover:border-[var(--brand)] hover:text-[var(--brand)]"
        >
          {copied ? "✓" : "🔗"}
        </button>
        <button
          type="button"
          onClick={refreshAll}
          title="새로고침"
          aria-label="새로고침"
          className="grid h-11 w-11 shrink-0 place-items-center rounded-[var(--radius)] border border-[var(--border)] text-[var(--text-base)] transition hover:border-[var(--brand)] hover:text-[var(--brand)]"
        >
          ↻
        </button>
      </header>

      {/* ── 모드 탭 ────────────────────────────────────── */}
      <nav className="thin-scroll z-20 flex shrink-0 gap-1.5 overflow-x-auto border-b border-[var(--border)] bg-[var(--surface)] px-4 pb-2.5">
        {MODES.map((m) => {
          const on = m.id === mode;
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => changeMode(m.id)}
              title={m.hint}
              aria-pressed={on}
              className="flex shrink-0 items-center gap-1 rounded-full px-3 py-1.5 text-[var(--text-sm)] font-bold transition"
              style={
                on
                  ? { background: "var(--brand)", color: "#fff" }
                  : { background: "var(--surface-2)", color: "var(--text-muted)" }
              }
            >
              <span>{m.emoji}</span>
              {m.label}
            </button>
          );
        })}
      </nav>

      {unavailableCount > 0 && (
        <div className="shrink-0 bg-amber-500/12 px-3 py-1 text-center text-[var(--text-2xs)] font-semibold text-amber-700 md:px-4 dark:text-amber-300">
일부 정보는 아직 연동되지 않아 표시되지 않습니다{" "}
          <a href="/status" className="underline underline-offset-2">
            상태 보기 →
          </a>
        </div>
      )}

      {/* ── 본문 ───────────────────────────────────────── */}
      <div className="flex min-h-0 flex-1">
        {/* 좌: 목록 (둘러보기 모드에는 목록이 없다) */}
        {def.categories.length > 0 && (
          <aside
            className={`shrink-0 border-r border-[var(--border)] bg-[var(--surface)] lg:block lg:w-[290px] ${
              tab === "list" ? "block w-full" : "hidden"
            }`}
          >
            <PlacesPanel
              res={places.data}
              isLoading={places.isLoading}
              categories={def.categories}
              radius={radius}
              onRadiusChange={setRadius}
              selectedPlaceId={selectedPlaceId}
              onSelectPlace={handleSelectPlace}
            />
          </aside>
        )}

        {/* 중: 지도 */}
        <main
          className={`relative min-w-0 flex-1 lg:block ${tab === "map" ? "block" : "hidden"}`}
        >
          <KakaoMap
            appKey={appKey}
            center={center}
            level={level}
            radius={def.layers.places ? radius : 0}
            places={def.layers.places ? (places.data?.data.places ?? []) : []}
            incidents={def.layers.incidents ? (traffic.data?.data.incidents ?? []) : []}
            busStops={def.layers.bus ? (transit.data?.data.stops ?? []) : []}
            trafficLinks={def.layers.traffic ? (traffic.data?.data.links ?? []) : []}
            medicalOpen={medicalMarkers}
            busPositions={busPositions.data?.ok ? busPositions.data.data : null}
            ratings={mode === "food" ? (ratings.data?.data.ratings ?? {}) : {}}
            landmarks={mode === "explore" ? LANDMARKS : []}
            showBoundary={showBoundary}
            activeDong={activeDong}
            fitBounds={fitBounds}
            onViewFitted={(c, lv) => {
              // 맞춘 결과를 상태에 반영해 주변 장소·정류소 조회가 새 위치를 따르게 한다
              setCenter(c);
              setLevel(lv);
            }}
            dimOutside={showBoundary && mode === "explore"}
            selectedPlaceId={selectedPlaceId}
            onSelectPlace={handleSelectPlace}
            onMapMoved={setCenter}
          />

          <div className="absolute left-3 top-3 z-10 flex gap-1.5">
            <button
              type="button"
              onClick={() => setShowBoundary((v) => !v)}
              className="inline-flex min-h-[40px] items-center rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)]/95 px-3 text-[var(--text-xs)] font-bold shadow-[var(--shadow-md)] backdrop-blur transition"
              style={showBoundary ? { color: "var(--brand)" } : { color: "var(--text-muted)" }}
            >
              🗾 시경계
            </button>
          </div>

          {selectedPlace && (
            <PlaceDetailCard
              key={selectedPlace.id}
              place={selectedPlace}
              rating={ratings.data?.data.ratings[selectedPlace.id]}
              showRating={mode === "food"}
              onClose={() => setSelectedPlaceId(null)}
              onRated={() => ratings.mutate()}
            />
          )}

          {/* 동 바로가기 — 상세 카드가 떠 있으면 자리를 비켜준다 */}
          <div
            className={`thin-scroll absolute bottom-3 left-3 right-14 z-10 flex gap-1 overflow-x-auto ${
              selectedPlace ? "hidden" : ""
            }`}
          >
            {DONGS.map((d) => {
              const on = activeDong === d.name;
              return (
                <button
                  key={d.name}
                  type="button"
                  aria-pressed={on}
                  title={`${d.name} 경계 보기 · 인구 ${d.population.toLocaleString("ko-KR")}명`}
                  onClick={() => toggleDong(d)}
                  className="shrink-0 rounded-full border px-2.5 py-1 text-[var(--text-xs)] font-bold shadow-md backdrop-blur transition"
                  style={
                    on
                      ? { background: "var(--info)", borderColor: "var(--info)", color: "var(--surface)" }
                      : { borderColor: "var(--border)", background: "color-mix(in srgb, var(--surface) 95%, transparent)" }
                  }
                >
                  {d.name}
                </button>
              );
            })}
          </div>

          <div className="absolute right-3 top-3 z-10 flex flex-col gap-1.5">
            <button
              type="button"
              onClick={() => {
                setActiveDong(null);
                setFitBounds({ ...UIWANG_BBOX });
                setTab("map");
              }}
              className="grid h-11 w-11 place-items-center rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)]/95 text-[var(--text-base)] shadow-[var(--shadow-md)] backdrop-blur transition hover:border-[var(--brand)]"
              title="의왕시 전체보기"
            >
              🗾
            </button>
            <button
              type="button"
              onClick={() => focus(UIWANG.center.lat, UIWANG.center.lng, 5)}
              className="grid h-11 w-11 place-items-center rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)]/95 text-[var(--text-base)] shadow-[var(--shadow-md)] backdrop-blur transition hover:border-[var(--brand)]"
              title="의왕시청으로"
            >
              🎯
            </button>
            <button
              type="button"
              onClick={() => setLevel((l) => Math.max(1, l - 1))}
              className="grid h-11 w-11 place-items-center rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)]/95 text-[var(--text-lg)] font-bold shadow-[var(--shadow-md)] backdrop-blur transition hover:border-[var(--brand)]"
            >
              +
            </button>
            <button
              type="button"
              onClick={() => setLevel((l) => Math.min(12, l + 1))}
              className="grid h-11 w-11 place-items-center rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)]/95 text-[var(--text-lg)] font-bold shadow-[var(--shadow-md)] backdrop-blur transition hover:border-[var(--brand)]"
            >
              −
            </button>
          </div>
        </main>

        {/* 우: 모드별 카드 */}
        <aside
          className={`thin-scroll shrink-0 space-y-3 overflow-y-auto border-l border-[var(--border)] bg-[var(--bg)] p-3 lg:block lg:w-[340px] ${
            tab === "info" ? "block w-full" : "hidden"
          }`}
        >
          <p className="px-1 pb-0.5 text-[var(--text-xs)] font-semibold text-[var(--text-faint)]">{def.hint}</p>
          {def.cards.map(card)}
        </aside>
      </div>

      {/* ── 모바일 탭바 ────────────────────────────────── */}
      <nav className="z-30 flex shrink-0 border-t border-[var(--border)] bg-[var(--surface)] lg:hidden">
        {(
          [
            ...(def.categories.length > 0
              ? [["list", "📋 목록"] as [MobileTab, string]]
              : []),
            ["map", "🗺️ 지도"] as [MobileTab, string],
            ["info", `${def.emoji} ${def.label}`] as [MobileTab, string],
          ] as [MobileTab, string][]
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => setTab(k)}
            className="min-h-[52px] flex-1 text-[var(--text-sm)] font-bold transition"
            style={{
              color: tab === k ? "var(--brand)" : "var(--text-muted)",
              borderTop: `2px solid ${tab === k ? "var(--brand)" : "transparent"}`,
            }}
          >
            {label}
          </button>
        ))}
      </nav>
    </div>
  );
}
