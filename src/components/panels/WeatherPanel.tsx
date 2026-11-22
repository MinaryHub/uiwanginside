"use client";

import { Section, Skeleton, LiveDot, Unavailable, hhmm } from "@/components/ui";
import { weatherIcon } from "@/lib/format";
import type { WeatherPayload, ApiEnvelope } from "@/lib/types";

export default function WeatherPanel({
  res,
  isLoading,
  error,
}: {
  res?: ApiEnvelope<WeatherPayload>;
  isLoading: boolean;
  error?: unknown;
}) {
  const d = res?.data;
  const alerts = d?.alerts ?? [];

  return (
    <Section title="날씨" right={<LiveDot live={d?.source === "kma" && !!d?.now} />}>
      {isLoading && !d ? (
        <Skeleton rows={2} />
      ) : !d?.now ? (
        <Unavailable reason={res?.notice} error={error} />
      ) : (
        <>
          {alerts.length > 0 && (
            <ul className="mb-3 space-y-1.5">
              {alerts.map((a) => {
                const isWarn = a.level === "warning";
                return (
                  <li
                    key={a.kind}
                    className="rounded-[var(--radius)] border-2 border-[var(--ink)] px-3 py-2 shadow-[var(--shadow-sm)]"
                    style={{
                      background: isWarn ? "var(--danger-soft)" : "var(--warn-soft)",
                      color: isWarn ? "var(--danger)" : "var(--warn)",
                    }}
                  >
                    <p className="text-[length:var(--text-xs)] font-extrabold">
                      <span aria-hidden>⚠ </span>
                      {a.kind} 발효 중
                    </p>
                    {a.since && (
                      <p className="mt-0.5 text-[length:var(--text-2xs)] font-semibold opacity-85">
                        {new Date(a.since).toLocaleString("ko-KR", {
                          month: "numeric",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                          hour12: false,
                          timeZone: "Asia/Seoul",
                        })}{" "}
                        발표 · 기상청
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          {d.now && (
            <div className="mb-3 flex items-center gap-3">
              <span aria-hidden className="text-4xl leading-none">
                {weatherIcon(d.now.sky, d.now.precipitation)}
              </span>
              <div className="flex-1">
                <div className="flex items-baseline gap-1.5">
                  <span className="tnum text-3xl font-bold tracking-tight">
                    {d.now.temp ?? "-"}
                  </span>
                  <span className="text-lg text-[var(--text-muted)]">°C</span>
                  <span className="ml-1 text-[length:var(--text-xs)] text-[var(--text-muted)]">
                    {d.now.precipitation !== "없음" ? d.now.precipitation : d.now.sky}
                  </span>
                </div>
                <div className="mt-0.5 flex flex-wrap gap-3 text-[length:var(--text-xs)] text-[var(--text-muted)]">
                  <span>습도 {d.now.humidity ?? "-"}%</span>
                  <span>바람 {d.now.windSpeed ?? "-"}m/s</span>
                  <span>강수 {d.now.rain1h ?? 0}mm</span>
                </div>
              </div>
            </div>
          )}

          {!!d.forecast.length && (
            <div className="thin-scroll -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
              {d.forecast.map((f) => (
                <div
                  key={f.time}
                  className="flex min-w-[62px] shrink-0 flex-col items-center gap-1 rounded-[var(--radius)] bg-[var(--surface-2)] px-2 py-2"
                >
                  <span className="text-[length:var(--text-2xs)] font-semibold text-[var(--text-muted)]">
                    {hhmm(f.time)}
                  </span>
                  <span aria-hidden className="text-lg leading-none">
                    {weatherIcon(f.sky, f.precipitation)}
                  </span>
                  <span className="tnum text-[length:var(--text-sm)] font-bold">
                    {f.temp ?? "-"}°
                  </span>
                  <span className="tnum text-[length:var(--text-2xs)] font-semibold text-[var(--info)]">
                    {f.pop != null && f.pop > 0 ? `${f.pop}%` : "\u00a0"}
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
