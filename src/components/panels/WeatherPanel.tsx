"use client";

import { Section, Skeleton, LiveDot, Unavailable, hhmm } from "@/components/ui";
import type { WeatherPayload, ApiEnvelope } from "@/lib/types";

const SKY_ICON: Record<string, string> = {
  맑음: "☀️",
  구름많음: "⛅",
  흐림: "☁️",
};
const PTY_ICON: Record<string, string> = {
  비: "🌧️",
  "비/눈": "🌨️",
  눈: "❄️",
  소나기: "🌦️",
  빗방울: "💧",
};

function icon(sky: string, pty: string) {
  if (pty && pty !== "없음") return PTY_ICON[pty] ?? "🌧️";
  return SKY_ICON[sky] ?? "🌤️";
}

export default function WeatherPanel({
  res,
  isLoading,
}: {
  res?: ApiEnvelope<WeatherPayload>;
  isLoading: boolean;
}) {
  const d = res?.data;
  return (
    <Section
      title="날씨"
      right={<LiveDot live={d?.source === "kma"} />}
    >
      {isLoading && !d ? (
        <Skeleton rows={2} />
      ) : !d?.now ? (
        <Unavailable reason={res?.notice} />
      ) : (
        <>
          {d?.now && (
            <div className="mb-3 flex items-center gap-3">
              <span className="text-4xl leading-none">
                {icon(d.now.sky, d.now.precipitation)}
              </span>
              <div className="flex-1">
                <div className="flex items-baseline gap-1.5">
                  <span className="text-3xl font-bold tracking-tight">
                    {d.now.temp ?? "-"}
                  </span>
                  <span className="text-lg text-[var(--text-muted)]">°C</span>
                  <span className="ml-1 text-[length:var(--text-xs)] text-[var(--text-muted)]">
                    {d.now.precipitation !== "없음" ? d.now.precipitation : d.now.sky}
                  </span>
                </div>
                <div className="mt-0.5 flex gap-3 text-[length:var(--text-xs)] text-[var(--text-muted)]">
                  <span>습도 {d.now.humidity ?? "-"}%</span>
                  <span>바람 {d.now.windSpeed ?? "-"}m/s</span>
                  <span>강수 {d.now.rain1h ?? 0}mm</span>
                </div>
              </div>
            </div>
          )}

          {!!d?.forecast.length && (
            <div className="thin-scroll -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
              {d.forecast.map((f) => (
                <div
                  key={f.time}
                  className="flex min-w-[62px] shrink-0 flex-col items-center gap-1 rounded-[var(--radius)] bg-[var(--surface-2)] px-2 py-2"
                >
                  <span className="text-[length:var(--text-2xs)] font-semibold text-[var(--text-muted)]">
                    {hhmm(f.time)}
                  </span>
                  <span className="text-lg leading-none">
                    {icon(f.sky, f.precipitation)}
                  </span>
                  <span className="text-[length:var(--text-sm)] font-bold">{f.temp ?? "-"}°</span>
                  <span className="text-[length:var(--text-2xs)] text-blue-500">
                    {f.pop != null && f.pop > 0 ? `${f.pop}%` : " "}
                  </span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </Section>
  );
}
