"use client";

import { Card, Skeleton, LiveDot, Unavailable, hhmm } from "@/components/ui";
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
    <Card
      title="날씨"
      icon="🌤️"
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
                  <span className="text-lg text-[var(--muted)]">°C</span>
                  <span className="ml-1 text-[12px] text-[var(--muted)]">
                    {d.now.precipitation !== "없음" ? d.now.precipitation : d.now.sky}
                  </span>
                </div>
                <div className="mt-0.5 flex gap-3 text-[11.5px] text-[var(--muted)]">
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
                  className="flex min-w-[62px] shrink-0 flex-col items-center gap-1 rounded-lg bg-[var(--surface-2)] px-2 py-2"
                >
                  <span className="text-[10.5px] font-semibold text-[var(--muted)]">
                    {hhmm(f.time)}
                  </span>
                  <span className="text-lg leading-none">
                    {icon(f.sky, f.precipitation)}
                  </span>
                  <span className="text-[12.5px] font-bold">{f.temp ?? "-"}°</span>
                  <span className="text-[10px] text-blue-500">
                    {f.pop != null && f.pop > 0 ? `${f.pop}%` : " "}
                  </span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </Card>
  );
}
