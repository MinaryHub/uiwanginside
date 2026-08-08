"use client";

import { useCallback, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import useSWR from "swr";
import { swrFetcher } from "@/lib/fetcher";
import { UIWANG, DONGS, LANDMARKS, type CategoryKey } from "@/lib/uiwang";
import type {
  ApiEnvelope,
  Place,
  PlacesPayload,
  WeatherPayload,
  NewsPayload,
  TrafficPayload,
  TransitPayload,
} from "@/lib/types";
import PlacesPanel from "@/components/panels/PlacesPanel";
import WeatherPanel from "@/components/panels/WeatherPanel";
import TrafficPanel from "@/components/panels/TrafficPanel";
import TransitPanel from "@/components/panels/TransitPanel";
import NewsPanel from "@/components/panels/NewsPanel";
import { hhmm } from "@/components/ui";

const KakaoMap = dynamic(() => import("@/components/KakaoMap"), { ssr: false });

/** 폴링 주기 (ms) */
const POLL = {
  weather: 10 * 60_000,
  traffic: 60_000,
  transit: 30_000,
  news: 5 * 60_000,
};

type MobileTab = "map" | "places" | "live";

export default function Dashboard({ appKey }: { appKey?: string }) {
  const [center, setCenter] = useState<{ lat: number; lng: number }>({
    lat: UIWANG.center.lat,
    lng: UIWANG.center.lng,
  });
  const [level, setLevel] = useState(6);
  const [radius, setRadius] = useState<number>(UIWANG.defaultRadius);
  const [categories, setCategories] = useState<CategoryKey[]>(["SC4", "HP8", "MT1", "CS2"]);
  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(null);
  const [newsQuery, setNewsQuery] = useState("의왕시");
  const [layers, setLayers] = useState({ incidents: true, bus: true, traffic: true });
  const [tab, setTab] = useState<MobileTab>("map");

  const geo = `lat=${center.lat.toFixed(4)}&lng=${center.lng.toFixed(4)}`;

  const places = useSWR<ApiEnvelope<PlacesPayload>>(
    categories.length
      ? `/api/places?categories=${categories.join(",")}&${geo}&radius=${radius}`
      : null,
    swrFetcher,
    { keepPreviousData: true, revalidateOnFocus: false },
  );
  const weather = useSWR<ApiEnvelope<WeatherPayload>>("/api/weather", swrFetcher, {
    refreshInterval: POLL.weather,
    keepPreviousData: true,
  });
  const traffic = useSWR<ApiEnvelope<TrafficPayload>>("/api/traffic", swrFetcher, {
    refreshInterval: POLL.traffic,
    keepPreviousData: true,
  });
  const transit = useSWR<ApiEnvelope<TransitPayload>>(
    `/api/transit?${geo}`,
    swrFetcher,
    { refreshInterval: POLL.transit, keepPreviousData: true },
  );
  const news = useSWR<ApiEnvelope<NewsPayload>>(
    `/api/news?q=${encodeURIComponent(newsQuery)}`,
    swrFetcher,
    { refreshInterval: POLL.news, keepPreviousData: true },
  );

  const refreshAll = useCallback(() => {
    places.mutate();
    weather.mutate();
    traffic.mutate();
    transit.mutate();
    news.mutate();
  }, [places, weather, traffic, transit, news]);

  const toggleCategory = useCallback((c: CategoryKey) => {
    setCategories((prev) =>
      prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c],
    );
  }, []);

  const focus = useCallback((lat: number, lng: number, lv = 4) => {
    setCenter({ lat, lng });
    setLevel(lv);
    setTab("map");
  }, []);

  const handleSelectPlace = useCallback(
    (p: Place) => {
      setSelectedPlaceId((id) => (id === p.id ? null : p.id));
      focus(p.lat, p.lng, 3);
    },
    [focus],
  );

  const accidentCount = useMemo(
    () => traffic.data?.data.incidents.filter((i) => i.kind === "accident").length ?? 0,
    [traffic.data],
  );

  const anySample = [places, weather, traffic, transit, news].some(
    (s) => s.data && s.data.ok === false,
  );

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      {/* ── 헤더 ─────────────────────────────────────────── */}
      <header className="z-30 flex shrink-0 items-center gap-3 border-b border-[var(--border)] bg-[var(--surface)] px-3 py-2 md:px-4">
        <div className="flex items-center gap-2">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-[var(--brand)] text-[15px]">
            🏙️
          </span>
          <div className="leading-tight">
            <h1 className="text-[14px] font-extrabold tracking-tight">의왕 인사이드</h1>
            <p className="hidden text-[10.5px] text-[var(--muted)] sm:block">
              의왕시 생활·실시간 정보 포털
            </p>
          </div>
        </div>

        {/* 동 이동 */}
        <nav className="thin-scroll hidden flex-1 gap-1 overflow-x-auto lg:flex">
          {DONGS.map((d) => (
            <button
              key={d.name}
              type="button"
              onClick={() => focus(d.lat, d.lng, 5)}
              className="shrink-0 rounded-full border border-[var(--border)] px-2.5 py-1 text-[11.5px] font-semibold text-[var(--muted)] transition hover:border-[var(--brand)] hover:text-[var(--brand)]"
            >
              {d.name}
            </button>
          ))}
          <span className="mx-1 w-px bg-[var(--border)]" />
          {LANDMARKS.map((l) => (
            <button
              key={l.name}
              type="button"
              title={l.desc}
              onClick={() => focus(l.lat, l.lng, 4)}
              className="shrink-0 rounded-full bg-[var(--surface-2)] px-2.5 py-1 text-[11.5px] font-semibold transition hover:brightness-95"
            >
              📍 {l.name}
            </button>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          {accidentCount > 0 && (
            <span className="hidden items-center gap-1 rounded-full bg-red-600/12 px-2 py-1 text-[11px] font-bold text-red-600 sm:flex dark:text-red-400">
              🚨 사고 {accidentCount}건
            </span>
          )}
          <span className="hidden text-[10.5px] text-[var(--muted)] md:block">
            {/* SWR 은 클라이언트에서만 fetch 하므로 SSR 결과와 첫 렌더가 일치한다 */}
            {traffic.data ? `갱신 ${hhmm(traffic.data.data.updatedAt)}` : ""}
          </span>
          <button
            type="button"
            onClick={refreshAll}
            className="rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-[11.5px] font-bold transition hover:border-[var(--brand)] hover:text-[var(--brand)]"
          >
            ↻ 새로고침
          </button>
        </div>
      </header>

      {anySample && (
        <div className="shrink-0 bg-amber-500/12 px-3 py-1 text-center text-[11px] font-semibold text-amber-700 md:px-4 dark:text-amber-300">
          일부 데이터가 샘플입니다 — <code>.env.local</code> 에 API 키를 설정하면 실시간으로
          전환됩니다.{" "}
          <a href="/status" className="underline underline-offset-2">
            연동 상태 확인 →
          </a>
        </div>
      )}

      {/* ── 본문 3단 ─────────────────────────────────────── */}
      <div className="flex min-h-0 flex-1">
        {/* 좌: 장소 */}
        <aside
          className={`shrink-0 border-r border-[var(--border)] bg-[var(--surface)] lg:block lg:w-[300px] ${
            tab === "places" ? "block w-full" : "hidden"
          }`}
        >
          <PlacesPanel
            res={places.data}
            isLoading={places.isLoading}
            selected={categories}
            onToggle={toggleCategory}
            radius={radius}
            onRadiusChange={setRadius}
            selectedPlaceId={selectedPlaceId}
            onSelectPlace={handleSelectPlace}
          />
        </aside>

        {/* 중: 지도 */}
        <main
          className={`relative min-w-0 flex-1 lg:block ${tab === "map" ? "block" : "hidden"}`}
        >
          <KakaoMap
            appKey={appKey}
            center={center}
            level={level}
            radius={radius}
            places={places.data?.data.places ?? []}
            incidents={traffic.data?.data.incidents ?? []}
            busStops={transit.data?.data.stops ?? []}
            trafficLinks={traffic.data?.data.links ?? []}
            showIncidents={layers.incidents}
            showBus={layers.bus}
            showTraffic={layers.traffic}
            selectedPlaceId={selectedPlaceId}
            onSelectPlace={handleSelectPlace}
            onMapMoved={setCenter}
          />

          {/* 레이어 토글 */}
          <div className="absolute left-3 top-3 z-10 flex gap-1.5 rounded-xl border border-[var(--border)] bg-[var(--surface)]/95 p-1.5 shadow-lg backdrop-blur">
            {(
              [
                ["incidents", "🚨 사고"],
                ["traffic", "🚗 속도"],
                ["bus", "🚌 정류소"],
              ] as const
            ).map(([k, label]) => (
              <button
                key={k}
                type="button"
                onClick={() => setLayers((l) => ({ ...l, [k]: !l[k] }))}
                className="rounded-lg px-2 py-1 text-[11px] font-bold transition"
                style={
                  layers[k]
                    ? { background: "var(--brand)", color: "#fff" }
                    : { color: "var(--muted)" }
                }
              >
                {label}
              </button>
            ))}
          </div>

          {/* 줌 / 중심복귀 */}
          <div className="absolute bottom-4 right-3 z-10 flex flex-col gap-1.5">
            <button
              type="button"
              onClick={() => focus(UIWANG.center.lat, UIWANG.center.lng, 6)}
              className="grid h-9 w-9 place-items-center rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[15px] shadow-lg"
              title="의왕시청으로"
            >
              🎯
            </button>
            <button
              type="button"
              onClick={() => setLevel((l) => Math.max(1, l - 1))}
              className="grid h-9 w-9 place-items-center rounded-lg border border-[var(--border)] bg-[var(--surface)] text-lg font-bold shadow-lg"
            >
              +
            </button>
            <button
              type="button"
              onClick={() => setLevel((l) => Math.min(12, l + 1))}
              className="grid h-9 w-9 place-items-center rounded-lg border border-[var(--border)] bg-[var(--surface)] text-lg font-bold shadow-lg"
            >
              −
            </button>
          </div>
        </main>

        {/* 우: 실시간 */}
        <aside
          className={`thin-scroll shrink-0 space-y-2.5 overflow-y-auto border-l border-[var(--border)] bg-[var(--background)] p-2.5 lg:block lg:w-[330px] ${
            tab === "live" ? "block w-full" : "hidden"
          }`}
        >
          <WeatherPanel res={weather.data} isLoading={weather.isLoading} />
          <TrafficPanel
            res={traffic.data}
            isLoading={traffic.isLoading}
            onFocus={(lat, lng) => focus(lat, lng, 4)}
          />
          <TransitPanel
            res={transit.data}
            isLoading={transit.isLoading}
            onFocus={(lat, lng) => focus(lat, lng, 3)}
          />
          <NewsPanel
            res={news.data}
            isLoading={news.isLoading}
            query={newsQuery}
            onQueryChange={setNewsQuery}
          />
          <p className="px-1 pb-2 text-center text-[10px] leading-relaxed text-[var(--muted)]">
            장소: 카카오 로컬 · 날씨: 기상청 · 교통: ITS 국가교통정보센터 · 버스: 경기버스정보
            · 뉴스: 네이버
          </p>
        </aside>
      </div>

      {/* ── 모바일 탭바 ──────────────────────────────────── */}
      <nav className="z-30 flex shrink-0 border-t border-[var(--border)] bg-[var(--surface)] lg:hidden">
        {(
          [
            ["places", "📋 목록"],
            ["map", "🗺️ 지도"],
            ["live", "⚡ 실시간"],
          ] as const
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
