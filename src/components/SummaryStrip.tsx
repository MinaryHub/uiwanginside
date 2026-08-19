"use client";

import { useEffect, useState } from "react";
import type { InfoTab } from "@/components/InfoOverlay";

import type {
  ApiEnvelope,
  WeatherPayload,
  AirPayload,
  TrafficPayload,
  MedicalPayload,
  NewsPayload,
  AirGrade,
} from "@/lib/types";

/**
 * "지금 의왕은 어떤가" 를 한 줄로 답한다.
 * 카드를 열지 않아도 되는 정보는 여기서 끝내고, 상세는 모드별 카드로 넘긴다.
 */

const GRADE_COLOR: Record<AirGrade, string> = {
  좋음: "var(--info)",
  보통: "var(--ok)",
  나쁨: "var(--warn)",
  매우나쁨: "var(--danger)",
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
    "flex min-h-[36px] shrink-0 items-center gap-1.5 rounded-[var(--radius)] px-2.5 text-[var(--text-sm)] font-bold transition";
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
  news,
  onOpen,
  onOpenInfo,
}: {
  weather?: ApiEnvelope<WeatherPayload>;
  air?: ApiEnvelope<AirPayload>;
  traffic?: ApiEnvelope<TrafficPayload>;
  medical?: ApiEnvelope<MedicalPayload>;
  news?: ApiEnvelope<NewsPayload>;
  onOpen: (mode: "medical" | "transit" | "life") => void;
  /**
   * 지도와 무관한 정보는 모드로 넘기지 않고 그 자리에서 펼친다.
   * 요약줄의 한 줄을 누르면 같은 주제의 상세가 열려야 한다.
   */
  onOpenInfo: (tab: InfoTab) => void;
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

  const alerts = weather?.data.alerts ?? [];
  /*
   * 최근 기사 셋을 돌아가며 보여준다.
   *
   * 건수("뉴스 20")는 알려주는 것이 없고, 제목은 그 자체로 "지금 의왕에
   * 무슨 일이 있나" 에 답한다. 한 줄에 셋을 나란히 놓을 자리는 없으니
   * 차례로 바꾼다.
   *
   * 5초는 짧은 제목을 읽기에 충분하고, 눈이 따라가기 힘들 만큼 잦지도
   * 않다. 하나뿐이면 바꿀 것이 없으니 타이머를 걸지 않는다.
   */
  const top = news?.ok ? news.data.items.slice(0, 3) : [];
  const [turn, setTurn] = useState(0);

  useEffect(() => {
    if (top.length < 2) return;
    const t = setInterval(() => setTurn((i) => i + 1), 5000);
    return () => clearInterval(t);
  }, [top.length]);

  // 기사 수가 줄어도 범위를 벗어나지 않게 나머지로 접는다
  const headline = top.length ? top[turn % top.length] : null;

  return (
    <div className="thin-scroll flex items-center gap-0.5 overflow-x-auto">
      {/*
        기상특보는 이 줄에서 가장 급한 정보다. 발효 중일 때만 나오고
        그때는 맨 앞에 온다. 경보는 주의보보다 위급해 더 진하게 칠한다.
        해제된 특보는 여기 오지 않는다 — 발표와 해제를 짝지어 걸러낸다.
      */}
      {alerts.map((a) => (
        <Item
          key={a.kind}
          onClick={() => onOpenInfo("weather")}
          title={`${new Date(a.since).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })} 발효 · 기상청`}
        >
          <span
            className="rounded-[var(--radius)] px-1.5 py-0.5 text-[var(--text-xs)] font-extrabold"
            style={{
              background: a.level === "warning" ? "var(--danger)" : "var(--warn)",
              color: "#fff",
            }}
          >
            ⚠ {a.kind}
          </span>
        </Item>
      ))}

      {/*
        뉴스는 특보 바로 다음, 날씨보다 앞에 둔다.
        좁은 화면에서 요약줄에 남는 폭이 354px 이라 끝에 두면 화면 밖으로
        밀린다 — 안 보여서 올려달라고 한 것을 또 안 보이게 두는 셈이다.
        목숨이 걸린 특보만 앞세우고 그다음 자리를 준다.
      */}
      {headline && (
        <Item onClick={() => onOpenInfo("news")} title={headline.title}>
          <span className="text-[1.05rem]">📰</span>
          {/* key 를 바꿔 제목이 갈릴 때마다 살짝 떠오르게 한다 */}
          <span
            key={headline.link}
            className="fade-up max-w-[110px] truncate font-semibold text-[var(--text-muted)] sm:max-w-[220px]"
          >
            {headline.title}
          </span>
          {top.length > 1 && (
            <span className="shrink-0 text-[var(--text-2xs)] tabular-nums text-[var(--text-faint)]">
              {(turn % top.length) + 1}/{top.length}
            </span>
          )}
        </Item>
      )}

      {/* 값을 못 가져온 항목은 아예 표시하지 않는다 — 빈칸이 기본값처럼 보이면 안 된다 */}
      {now?.temp != null && (
        <>
          {headline && <span className="h-4 w-px shrink-0 bg-[var(--border)]" />}
          <Item onClick={() => onOpenInfo("weather")} title="날씨 상세 보기">
            <span className="text-[1.05rem]">{icon}</span>
            <span className="tabular-nums">{now.temp}°</span>
          </Item>
        </>
      )}

      {grade && (
        <>
          <span className="h-4 w-px shrink-0 bg-[var(--border)]" />
          <Item onClick={() => onOpenInfo("air")} title="미세먼지 상세 보기">
            <span className="text-[var(--text-muted)]">미세</span>
            <span style={{ color: GRADE_COLOR[grade] }}>{grade}</span>
          </Item>
        </>
      )}

      {traffic?.ok && (
        <>
          <span className="h-4 w-px shrink-0 bg-[var(--border)]" />
          <Item onClick={() => onOpen("transit")} title="교통 상황 보기">
            {accidents > 0 ? (
              <span className="text-[var(--danger)]">🚨 사고 {accidents}</span>
            ) : (
              <span className="text-[var(--text-muted)]">🚗 사고없음</span>
            )}
          </Item>
        </>
      )}

      {openClinics != null && (
        <>
          <span className="h-4 w-px shrink-0 bg-[var(--border)]" />
          <Item onClick={() => onOpen("medical")} title="진료 중인 곳 보기">
            <span className="text-[var(--text-muted)]">진료중</span>
            <span className="text-[var(--brand)] tabular-nums">{openClinics}</span>
          </Item>
        </>
      )}
    </div>
  );
}
