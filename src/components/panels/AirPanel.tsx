"use client";

import { Section, Skeleton, LiveDot, Unavailable } from "@/components/ui";
import { AIR_STYLE, overallGrade, worse } from "@/lib/air";
import type { AirPayload, ApiEnvelope, AirGrade, AirStation, AirForecast } from "@/lib/types";

/** 등급 낱말을 그 색 알약으로 */
function GradeTag({ g }: { g: AirGrade | null }) {
  if (!g) return <span className="text-[var(--text-faint)]">-</span>;
  const st = AIR_STYLE[g];
  return (
    <span
      className="inline-block rounded-full border-2 border-[var(--ink)] px-2 py-0.5 text-[length:var(--text-2xs)] font-extrabold text-[#23201c]"
      style={{ background: st.tint }}
    >
      {g}
    </span>
  );
}

function StationRow({ s }: { s: AirStation }) {
  return (
    <li className="flex items-center gap-2 py-2.5">
      <span className="w-14 shrink-0 font-extrabold">{s.name}</span>
      <span className="min-w-0 flex-1 text-[length:var(--text-xs)] text-[var(--text-muted)]">
        미세 <b className="tnum text-[var(--text)]">{s.pm10 ?? "-"}</b> · 초미세{" "}
        <b className="tnum text-[var(--text)]">{s.pm25 ?? "-"}</b>
        <span className="text-[length:var(--text-2xs)]"> ㎍/㎥</span>
      </span>
      <GradeTag g={worse(s.pm10Grade, s.pm25Grade)} />
    </li>
  );
}

function dayLabel(date: string, i: number) {
  // 한국 정오로 잡으면 UTC 로도 같은 날이다
  const w = "일월화수목금토"[new Date(`${date}T12:00:00+09:00`).getUTCDay()];
  return `${i === 0 ? "오늘" : "내일"} (${w})`;
}

function ForecastCard({ f, i }: { f: AirForecast; i: number }) {
  const g = worse(f.pm10, f.pm25);
  const st = g ? AIR_STYLE[g] : null;
  return (
    <div
      className="flex flex-col items-center rounded-[var(--radius)] border-2 border-[var(--ink)] px-2 py-2.5 text-[#23201c] shadow-[var(--shadow-sm)]"
      style={{ background: st?.tint ?? "var(--surface-2)" }}
    >
      <span className="text-[length:var(--text-xs)] font-extrabold">{dayLabel(f.date, i)}</span>
      <span aria-hidden className="mt-1 text-[1.8rem] leading-none">
        {st?.emoji ?? "❔"}
      </span>
      <span className="mt-1 text-[length:var(--text-sm)] font-extrabold">{g ?? "예보 없음"}</span>
      <span className="mt-0.5 text-[length:var(--text-2xs)] font-semibold opacity-75">
        미세 {f.pm10 ?? "-"} · 초미세 {f.pm25 ?? "-"}
      </span>
    </div>
  );
}

export default function AirPanel({
  res,
  isLoading,
}: {
  res?: ApiEnvelope<AirPayload>;
  isLoading: boolean;
}) {
  const d = res?.data;
  const stations = d?.stations ?? [];
  const grade = overallGrade(stations);
  const st = grade ? AIR_STYLE[grade] : null;
  const forecast = d?.forecast ?? [];

  return (
    <Section title="공기" right={<LiveDot live={d?.source === "airkorea" && stations.length > 0} />}>
      {isLoading && !d ? (
        <Skeleton rows={3} />
      ) : stations.length === 0 ? (
        <Unavailable reason={res?.notice} />
      ) : (
        <>
          {/* 한눈에 — 얼굴, 등급, 해야 할 일 */}
          <div
            className="flex items-center gap-3 rounded-[var(--radius-lg)] border-2 border-[var(--ink)] p-3.5 text-[#23201c] shadow-[var(--shadow-md)]"
            style={{ background: st?.tint ?? "var(--surface-2)" }}
          >
            <span aria-hidden className="text-[3rem] leading-none">
              {st?.emoji ?? "❔"}
            </span>
            <div className="min-w-0">
              <p className="text-[length:var(--text-xs)] font-bold opacity-75">지금 의왕 공기</p>
              <p className="text-[1.6rem] font-extrabold leading-tight">{grade ?? "알 수 없음"}</p>
              {st && <p className="text-[length:var(--text-sm)] font-bold">{st.say}</p>}
            </div>
          </div>

          {/* 측정소별 — 가장 나쁜 곳 기준으로 위 등급을 정했으니, 어디가 그런지 보여준다 */}
          <ul className="mt-3 divide-y-2 divide-dashed divide-[var(--border)]">
            {stations.map((s) => (
              <StationRow key={s.name} s={s} />
            ))}
          </ul>
          <p className="text-[length:var(--text-2xs)] text-[var(--text-faint)]">
            에어코리아 측정 · {stations[0]?.measuredAt || "시각 미상"}
          </p>

          {forecast.length > 0 && (
            <>
              <h3 className="mb-2 mt-5 text-[length:var(--text-sm)] font-extrabold">
                예보 · 경기남부
              </h3>
              <div className={`grid gap-2 ${forecast.length > 1 ? "grid-cols-2" : "grid-cols-1"}`}>
                {forecast.map((f, i) => (
                  <ForecastCard key={f.date} f={f} i={i} />
                ))}
              </div>
              {d?.forecastAt && (
                <p className="mt-1.5 text-[length:var(--text-2xs)] text-[var(--text-faint)]">
                  {d.forecastAt}
                </p>
              )}
            </>
          )}
        </>
      )}
    </Section>
  );
}
