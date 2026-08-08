"use client";

import type {
  ApiEnvelope,
  WeatherPayload,
  AirPayload,
  TrafficPayload,
  MedicalPayload,
  AirGrade,
} from "@/lib/types";

/**
 * "지금 의왕은 어떤가" 를 한 줄로 답한다.
 * 카드를 열지 않아도 되는 정보는 여기서 끝내고, 상세는 모드별 카드로 넘긴다.
 */

const GRADE_COLOR: Record<AirGrade, string> = {
  좋음: "#0ea5e9",
  보통: "#16a34a",
  나쁨: "#f59e0b",
  매우나쁨: "#dc2626",
};

const SKY_ICON: Record<string, string> = { 맑음: "☀️", 구름많음: "⛅", 흐림: "☁️" };
const PTY_ICON: Record<string, string> = {
  비: "🌧️",
  "비/눈": "🌨️",
  눈: "❄️",
  소나기: "🌦️",
};

function Item({
  onClick,
  title,
  children,
}: {
  onClick?: () => void;
  title?: string;
  children: React.ReactNode;
}) {
  const cls =
    "flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-[12px] font-bold transition";
  return onClick ? (
    <button type="button" onClick={onClick} title={title} className={`${cls} hover:bg-[var(--surface-2)]`}>
      {children}
    </button>
  ) : (
    <span title={title} className={cls}>
      {children}
    </span>
  );
}

export default function SummaryStrip({
  weather,
  air,
  traffic,
  medical,
  onOpen,
}: {
  weather?: ApiEnvelope<WeatherPayload>;
  air?: ApiEnvelope<AirPayload>;
  traffic?: ApiEnvelope<TrafficPayload>;
  medical?: ApiEnvelope<MedicalPayload>;
  onOpen: (mode: "medical" | "transit" | "life") => void;
}) {
  const now = weather?.data.now;
  const station = air?.data.stations[0];
  const grade = station?.pm25Grade ?? station?.pm10Grade ?? null;
  const accidents =
    traffic?.data.incidents.filter((i) => i.kind === "accident").length ?? 0;
  // 연동 전에는 0 이 아니라 표시 자체를 생략한다
  const openClinics = medical?.ok
    ? medical.data.places.filter((p) => p.openNow === true).length
    : null;

  const icon =
    now && now.precipitation !== "없음"
      ? (PTY_ICON[now.precipitation] ?? "🌧️")
      : (SKY_ICON[now?.sky ?? ""] ?? "🌤️");

  return (
    <div className="thin-scroll flex items-center gap-0.5 overflow-x-auto">
      {/* 값을 못 가져온 항목은 아예 표시하지 않는다 — 빈칸이 기본값처럼 보이면 안 된다 */}
      {now?.temp != null && (
        <Item onClick={() => onOpen("life")} title="날씨 상세 보기">
          <span className="text-[14px]">{icon}</span>
          <span className="tabular-nums">{now.temp}°</span>
        </Item>
      )}

      {grade && (
        <>
          <span className="h-3 w-px shrink-0 bg-[var(--border)]" />
          <Item onClick={() => onOpen("medical")} title="대기질 상세 보기">
            <span className="text-[var(--muted)]">미세</span>
            <span style={{ color: GRADE_COLOR[grade] }}>{grade}</span>
          </Item>
        </>
      )}

      {traffic?.ok && (
        <>
          <span className="h-3 w-px shrink-0 bg-[var(--border)]" />
          <Item onClick={() => onOpen("transit")} title="교통 상황 보기">
            {accidents > 0 ? (
              <span className="text-red-600 dark:text-red-400">🚨 사고 {accidents}</span>
            ) : (
              <span className="text-[var(--muted)]">🚗 사고없음</span>
            )}
          </Item>
        </>
      )}

      {openClinics != null && (
        <>
          <span className="h-3 w-px shrink-0 bg-[var(--border)]" />
          <Item onClick={() => onOpen("medical")} title="진료 중인 곳 보기">
            <span className="text-[var(--muted)]">진료중</span>
            <span className="text-[var(--brand)] tabular-nums">{openClinics}</span>
          </Item>
        </>
      )}
    </div>
  );
}
