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

/**
 * 요약줄의 한 칸.
 *
 * 예전에는 이모지와 굵은 글씨를 칸마다 다르게 섞고 세로선으로 갈랐다.
 * 무엇이 이름이고 무엇이 값인지 칸마다 규칙이 달라 한눈에 안 읽혔다.
 * 이제 모든 칸이 같은 구조다 — 흐린 이름, 진한 값. 눈이 값만 훑을 수 있다.
 *
 * 누르면 상세가 열리는 칸은 열려 있는 동안 배경이 찬다. 한 번 더 누르면
 * 닫히기 때문에, 지금 무엇이 열려 있는지 보이지 않으면 누르는 쪽이 헷갈린다.
 */
function Item({
  label,
  onClick,
  active = false,
  grow = false,
  title,
  children,
}: {
  label?: string;
  onClick?: () => void;
  active?: boolean;
  /**
   * 폭이 모자랄 때 먼저 줄어드는 칸.
   *
   * 좁은 화면(348px)에서 이 줄에 담기는 내용은 511px 였다. 뉴스 제목 한 칸이
   * 189px — 절반이 넘는다 — 을 먹어 사고와 진료가 화면 밖으로 밀려 있었다.
   * 상태 배지 넷은 합쳐도 314px 라 뉴스만 양보하면 모두 들어온다.
   *
   * 그래서 상태 배지는 폭을 고정하고(shrink-0) 뉴스만 남는 자리를 쓴다.
   * 넓은 화면에서는 제목이 그만큼 길게 나오고, 좁은 화면에서는 짧아지되
   * 아이콘은 남아 눌러서 펼칠 수 있다. 사고·진료가 안 보이는 것보다 낫다.
   */
  grow?: boolean;
  title?: string;
  children: React.ReactNode;
}) {
  const cls = `flex min-h-[36px] items-center gap-1.5 rounded-[var(--radius-full)] px-2.5 text-[var(--text-sm)] transition ${
    grow ? "min-w-0 flex-1" : "shrink-0"
  }`;
  const body = (
    <>
      {label && (
        <span className={active ? "opacity-80" : "text-[var(--text-muted)]"}>{label}</span>
      )}
      <span className="flex min-w-0 items-center gap-1.5 font-bold tabular-nums">{children}</span>
    </>
  );
  return onClick ? (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-pressed={active}
      className={`${cls} ${active ? "" : "hover:bg-[var(--surface-2)]"}`}
      style={active ? { background: "var(--brand-grad)", color: "var(--on-brand)" } : undefined}
    >
      {body}
    </button>
  ) : (
    <span title={title} className={cls}>
      {body}
    </span>
  );
}

export default function SummaryStrip({
  weather,
  air,
  traffic,
  medical,
  news,
  openTab,
  onOpenInfo,
}: {
  weather?: ApiEnvelope<WeatherPayload>;
  air?: ApiEnvelope<AirPayload>;
  traffic?: ApiEnvelope<TrafficPayload>;
  medical?: ApiEnvelope<MedicalPayload>;
  news?: ApiEnvelope<NewsPayload>;
  /**
   * 지금 열려 있는 상세. 열린 칸을 채워 보여주기 위해 필요하다 —
   * 같은 칸을 다시 누르면 닫히는데, 상태가 안 보이면 무엇을 누르는지 모른다.
   */
  openTab: InfoTab | null;
  /**
   * 요약줄의 한 칸을 누르면 같은 주제의 상세가 그 자리에서 열린다.
   * 같은 칸을 다시 누르면 닫는 것까지 이 콜백이 맡는다.
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
          active={openTab === "weather"}
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
        <Item
          grow
          active={openTab === "news"}
          onClick={() => onOpenInfo("news")}
          title={headline.title}
        >
          <span className="shrink-0 text-[1.05rem]">📰</span>
          {/* key 를 바꿔 제목이 갈릴 때마다 살짝 떠오르게 한다 */}
          <span
            key={headline.link}
            className={`fade-up min-w-0 flex-1 truncate font-semibold ${
              openTab === "news" ? "" : "text-[var(--text-muted)]"
            }`}
          >
            {headline.title}
          </span>
          {top.length > 1 && (
            <span
              className={`hidden shrink-0 text-[var(--text-2xs)] tabular-nums sm:inline ${
                openTab === "news" ? "opacity-70" : "text-[var(--text-faint)]"
              }`}
            >
              {(turn % top.length) + 1}/{top.length}
            </span>
          )}
        </Item>
      )}

      {/* 값을 못 가져온 항목은 아예 표시하지 않는다 — 빈칸이 기본값처럼 보이면 안 된다 */}
      {now?.temp != null && (
        <Item
          label={icon}
          active={openTab === "weather"}
          onClick={() => onOpenInfo("weather")}
          title="날씨 상세 보기"
        >
          {now.temp}°
        </Item>
      )}

      {grade && (
        <Item
          label="미세"
          active={openTab === "air"}
          onClick={() => onOpenInfo("air")}
          title="미세먼지 상세 보기"
        >
          <span style={openTab === "air" ? undefined : { color: GRADE_COLOR[grade] }}>
            {grade}
          </span>
        </Item>
      )}

      {/*
        사고와 진료는 예전엔 지도 모드를 바꾸고 시트를 열었다. 같은 줄의
        날씨·미세먼지는 그 자리에서 펼쳐지는데 이 둘만 화면이 통째로 바뀌어,
        누르기 전에는 무슨 일이 일어날지 알 수 없었다. 이제 모두 같게 연다.
      */}
      {traffic?.ok && (
        <Item
          label="사고"
          active={openTab === "traffic"}
          onClick={() => onOpenInfo("traffic")}
          title="사고·정체 상세 보기"
        >
          {accidents > 0 ? (
            <span style={openTab === "traffic" ? undefined : { color: "var(--danger)" }}>
              {accidents}건
            </span>
          ) : (
            <span className={openTab === "traffic" ? undefined : "text-[var(--text-muted)]"}>
              없음
            </span>
          )}
        </Item>
      )}

      {openClinics != null && (
        <Item
          label="진료중"
          active={openTab === "medical"}
          onClick={() => onOpenInfo("medical")}
          title="진료 중인 곳 보기"
        >
          <span style={openTab === "medical" ? undefined : { color: "var(--brand)" }}>
            {openClinics}
          </span>
        </Item>
      )}
    </div>
  );
}
