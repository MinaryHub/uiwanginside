"use client";

import { useEffect, useRef } from "react";
import NewsPanel from "@/components/panels/NewsPanel";
import WeatherPanel from "@/components/panels/WeatherPanel";
import AirPanel from "@/components/panels/AirPanel";
import WastePanel from "@/components/panels/WastePanel";
import PopulationPanel from "@/components/panels/PopulationPanel";
import TrafficPanel from "@/components/panels/TrafficPanel";
import MedicalPanel from "@/components/panels/MedicalPanel";
import type {
  ApiEnvelope,
  NewsPayload,
  WeatherPayload,
  AirPayload,
  TrafficPayload,
  MedicalPayload,
} from "@/lib/types";

/**
 * 상단 요약줄에서 바로 펼치는 생활 정보.
 *
 * 요약줄은 "지금 의왕은 어떤가" 를 한 줄로 답한다. 그 한 줄을 누르면
 * 같은 주제의 상세가 그 자리에서 열려야 한다 — 모드를 고르고 시트를
 * 열어 목록을 지나 내려가는 것은 정보를 찾는 길이 아니다.
 *
 * 쓰레기 배출요일과 인구처럼 요약줄에 자리가 없는 것도 탭으로 닿는다.
 * 좁은 화면에서 요약줄에 남는 폭은 354px 이라 항목을 더 늘릴 수 없었다.
 *
 * 지도와 무관한 정보는 모두 여기로 모았다. 시트는 지도에 찍히는 것
 * (장소·정류소·CCTV)만 다룬다. 두 곳에 같은 것을 두면 한쪽은 반드시
 * 묻힌다 — 뉴스가 그랬다.
 */
export type InfoTab =
  | "news"
  | "weather"
  | "air"
  | "traffic"
  | "medical"
  | "waste"
  | "population";

const TABS: { id: InfoTab; label: string }[] = [
  { id: "news", label: "뉴스" },
  { id: "weather", label: "날씨" },
  { id: "air", label: "미세먼지" },
  { id: "traffic", label: "사고·정체" },
  { id: "medical", label: "진료" },
  { id: "waste", label: "쓰레기" },
  { id: "population", label: "인구" },
];

export default function InfoOverlay({
  tab,
  onTabChange,
  news,
  weather,
  air,
  traffic,
  medical,
  onFocus,
  query,
  onQueryChange,
  activeDong,
  onSelectDong,
  onClose,
}: {
  tab: InfoTab;
  onTabChange: (t: InfoTab) => void;
  news: { res?: ApiEnvelope<NewsPayload>; isLoading: boolean };
  weather: { res?: ApiEnvelope<WeatherPayload>; isLoading: boolean };
  air: { res?: ApiEnvelope<AirPayload>; isLoading: boolean };
  traffic: { res?: ApiEnvelope<TrafficPayload>; isLoading: boolean };
  medical: { res?: ApiEnvelope<MedicalPayload>; isLoading: boolean };
  /** 목록에서 한 곳을 고르면 지도를 그리로 옮기고 오버레이는 비켜준다. */
  onFocus: (lat: number, lng: number, level: number) => void;
  query: string;
  onQueryChange: (q: string) => void;
  activeDong: string | null;
  onSelectDong: (d: { name: string }) => void;
  onClose: () => void;
}) {
  const boxRef = useRef<HTMLDivElement>(null);

  // 바깥을 누르거나 Esc 로 닫는다 — 지도를 만지려는데 걸리면 성가시다
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  return (
    <div className="pointer-events-none absolute inset-x-0 top-[104px] z-50 flex justify-center px-3 sm:top-[64px]">
      <div
        ref={boxRef}
        className="fade-up pointer-events-auto flex max-h-[72vh] w-full max-w-[520px] flex-col overflow-hidden rounded-[var(--radius-xl)] bg-[var(--surface)] shadow-[var(--shadow-lg)] ring-1 ring-[var(--glass-ring)]"
      >
        <div className="flex items-center gap-1 border-b border-[var(--border)] pl-2 pr-1">
          <div className="thin-scroll flex flex-1 gap-0.5 overflow-x-auto py-1.5">
            {TABS.map((t) => {
              const on = t.id === tab;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => onTabChange(t.id)}
                  aria-pressed={on}
                  className={`press min-h-[36px] shrink-0 rounded-[var(--radius-full)] px-3.5 text-[var(--text-sm)] font-bold ${
                    on ? "brand-fill" : "text-[var(--text-muted)] hover:bg-[var(--surface-2)]"
                  }`}
                >
                  {t.label}
                </button>
              );
            })}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="press grid h-10 w-10 shrink-0 place-items-center rounded-[var(--radius-full)] text-[var(--text-muted)] hover:bg-[var(--surface-2)]"
          >
            ✕
          </button>
        </div>

        {/* 시트에 있던 패널을 그대로 쓴다 — 새로 만들면 두 곳이 갈린다 */}
        <div className="thin-scroll min-h-0 flex-1 overflow-y-auto">
          {tab === "news" && (
            <NewsPanel
              res={news.res}
              isLoading={news.isLoading}
              query={query}
              onQueryChange={onQueryChange}
            />
          )}
          {tab === "weather" && <WeatherPanel res={weather.res} isLoading={weather.isLoading} />}
          {tab === "air" && <AirPanel res={air.res} isLoading={air.isLoading} />}
          {tab === "traffic" && (
            <TrafficPanel
              res={traffic.res}
              isLoading={traffic.isLoading}
              onFocus={(lat, lng) => onFocus(lat, lng, 500)}
            />
          )}
          {tab === "medical" && (
            <MedicalPanel
              res={medical.res}
              isLoading={medical.isLoading}
              onFocus={(lat, lng) => onFocus(lat, lng, 250)}
            />
          )}
          {tab === "waste" && <WastePanel />}
          {tab === "population" && (
            <PopulationPanel onSelectDong={onSelectDong} activeDong={activeDong} />
          )}
        </div>
      </div>
    </div>
  );
}
