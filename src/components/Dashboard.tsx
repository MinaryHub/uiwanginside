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

  const refreshAll = useCallback(() => {
    [places, weather, air, traffic, medical, transit, news].forEach((s) => s.mutate());
  }, [places, weather, air, traffic, medical, transit, news]);

  // ── 동작 ──────────────────────────────────────────────
  const focus = useCallback((lat: number, lng: number, lv = 4) => {
    setCenter({ lat, lng });
    setLevel(lv);
    setTab("map");
  }, []);

  const changeMode = useCallback((next: ModeId) => {
    setMode(next);
    setSelectedPlaceId(null);
    setActiveDong(null);
    setLevel(MODE_MAP[next].level);
    setTab("map");
  }, []);

  /** 동을 누르면 경계를 강조하고 그리로 이동. 같은 동을 다시 누르면 해제한다. */
  const toggleDong = useCallback(
    (d: { name: string; lat: number; lng: number }) => {
      setActiveDong((cur) => {
        if (cur === d.name) return null;
        focus(d.lat, d.lng, 5);
        return d.name;
      });
    },
    [focus],
  );

  const handleSelectPlace = useCallback(
    (p: Place) => {
      setSelectedPlaceId((id) => (id === p.id ? null : p.id));
      focus(p.lat, p.lng, 3);
    },
    [focus],
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
            selected={selectedPlace}
            ratings={ratings.data?.data.ratings ?? {}}
            places={placeList}
            onRated={() => ratings.mutate()}
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
      <header className="z-30 flex shrink-0 items-center gap-2 border-b border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 md:px-4">
        <button
          type="button"
          onClick={() => changeMode("explore")}
          className="flex shrink-0 items-center gap-1.5"
        >
          <span className="grid h-6 w-6 place-items-center rounded-md bg-[var(--brand)] text-[13px]">
            🏙️
          </span>
          <span className="hidden text-[13px] font-extrabold tracking-tight sm:block">
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
          className="shrink-0 rounded-lg border border-[var(--border)] px-2 py-1 text-[11.5px] font-bold transition hover:border-[var(--brand)]"
        >
          {copied ? "✓" : "🔗"}
        </button>
        <button
          type="button"
          onClick={refreshAll}
          title="새로고침"
          className="shrink-0 rounded-lg border border-[var(--border)] px-2 py-1 text-[11.5px] font-bold transition hover:border-[var(--brand)]"
        >
          ↻
        </button>
      </header>

      {/* ── 모드 탭 ────────────────────────────────────── */}
      <nav className="thin-scroll z-20 flex shrink-0 gap-1 overflow-x-auto border-b border-[var(--border)] bg-[var(--surface)] px-2 py-1.5">
        {MODES.map((m) => {
          const on = m.id === mode;
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => changeMode(m.id)}
              title={m.hint}
              aria-pressed={on}
              className="flex shrink-0 items-center gap-1 rounded-full px-3 py-1.5 text-[12.5px] font-bold transition"
              style={
                on
                  ? { background: "var(--brand)", color: "#fff" }
                  : { background: "var(--surface-2)", color: "var(--muted)" }
              }
            >
              <span>{m.emoji}</span>
              {m.label}
            </button>
          );
        })}
      </nav>

      {unavailableCount > 0 && (
        <div className="shrink-0 bg-amber-500/12 px-3 py-1 text-center text-[10.5px] font-semibold text-amber-700 md:px-4 dark:text-amber-300">
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
            ratings={mode === "food" ? (ratings.data?.data.ratings ?? {}) : {}}
            landmarks={mode === "explore" ? LANDMARKS : []}
            showBoundary={showBoundary}
            activeDong={activeDong}
            dimOutside={showBoundary && mode === "explore"}
            selectedPlaceId={selectedPlaceId}
            onSelectPlace={handleSelectPlace}
            onMapMoved={setCenter}
          />

          <div className="absolute left-3 top-3 z-10 flex gap-1.5">
            <button
              type="button"
              onClick={() => setShowBoundary((v) => !v)}
              className="rounded-lg border border-[var(--border)] bg-[var(--surface)]/95 px-2 py-1 text-[11px] font-bold shadow-md backdrop-blur transition"
              style={showBoundary ? { color: "var(--brand)" } : { color: "var(--muted)" }}
            >
              🗾 시경계
            </button>
          </div>

          {/* 동 바로가기 */}
          <div className="thin-scroll absolute bottom-3 left-3 right-14 z-10 flex gap-1 overflow-x-auto">
            {DONGS.map((d) => {
              const on = activeDong === d.name;
              return (
                <button
                  key={d.name}
                  type="button"
                  aria-pressed={on}
                  title={`${d.name} 경계 보기 · 인구 ${d.population.toLocaleString("ko-KR")}명`}
                  onClick={() => toggleDong(d)}
                  className="shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-bold shadow-md backdrop-blur transition"
                  style={
                    on
                      ? { background: "#c026d3", borderColor: "#c026d3", color: "#fff" }
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
              onClick={() =>
                focus(
                  (UIWANG_BBOX.minLat + UIWANG_BBOX.maxLat) / 2,
                  (UIWANG_BBOX.minLng + UIWANG_BBOX.maxLng) / 2,
                  8,
                )
              }
              className="grid h-8 w-8 place-items-center rounded-lg border border-[var(--border)] bg-[var(--surface)]/95 text-[14px] shadow-md backdrop-blur"
              title="의왕시 전체보기"
            >
              🗾
            </button>
            <button
              type="button"
              onClick={() => focus(UIWANG.center.lat, UIWANG.center.lng, 5)}
              className="grid h-8 w-8 place-items-center rounded-lg border border-[var(--border)] bg-[var(--surface)]/95 text-[14px] shadow-md backdrop-blur"
              title="의왕시청으로"
            >
              🎯
            </button>
            <button
              type="button"
              onClick={() => setLevel((l) => Math.max(1, l - 1))}
              className="grid h-8 w-8 place-items-center rounded-lg border border-[var(--border)] bg-[var(--surface)]/95 text-base font-bold shadow-md backdrop-blur"
            >
              +
            </button>
            <button
              type="button"
              onClick={() => setLevel((l) => Math.min(12, l + 1))}
              className="grid h-8 w-8 place-items-center rounded-lg border border-[var(--border)] bg-[var(--surface)]/95 text-base font-bold shadow-md backdrop-blur"
            >
              −
            </button>
          </div>
        </main>

        {/* 우: 모드별 카드 */}
        <aside
          className={`thin-scroll shrink-0 space-y-2.5 overflow-y-auto border-l border-[var(--border)] bg-[var(--background)] p-2.5 lg:block lg:w-[320px] ${
            tab === "info" ? "block w-full" : "hidden"
          }`}
        >
          <p className="px-1 text-[11px] font-semibold text-[var(--muted)]">{def.hint}</p>
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
            className="flex-1 py-2.5 text-[12px] font-bold transition"
            style={{
              color: tab === k ? "var(--brand)" : "var(--muted)",
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
