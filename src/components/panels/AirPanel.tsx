"use client";

import { Card, Skeleton, LiveDot, Unavailable } from "@/components/ui";
import type { AirPayload, ApiEnvelope, AirGrade } from "@/lib/types";

const GRADE_STYLE: Record<AirGrade, { color: string; emoji: string }> = {
  좋음: { color: "#0ea5e9", emoji: "😊" },
  보통: { color: "#16a34a", emoji: "🙂" },
  나쁨: { color: "#f59e0b", emoji: "😷" },
  매우나쁨: { color: "#dc2626", emoji: "🤢" },
};

function Metric({
  label,
  value,
  unit,
  grade,
}: {
  label: string;
  value: number | null;
  unit: string;
  grade?: AirGrade | null;
}) {
  const style = grade ? GRADE_STYLE[grade] : null;
  return (
    <div className="flex flex-col items-center rounded-lg bg-[var(--surface-2)] px-1.5 py-2">
      <span className="text-[10px] font-semibold text-[var(--muted)]">{label}</span>
      <span
        className="mt-0.5 text-[15px] font-extrabold leading-none tabular-nums"
        style={style ? { color: style.color } : undefined}
      >
        {value ?? "-"}
      </span>
      <span className="mt-0.5 text-[9.5px] text-[var(--muted)]">{unit}</span>
      {grade && (
        <span
          className="mt-0.5 text-[10px] font-bold"
          style={{ color: style!.color }}
        >
          {grade}
        </span>
      )}
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
  const primary = stations[0];
  const worst = primary?.pm25Grade ?? primary?.pm10Grade ?? null;

  return (
    <Card
      title="미세먼지"
      icon={worst ? GRADE_STYLE[worst].emoji : "🌫️"}
      right={<LiveDot live={d?.source === "airkorea"} />}
    >
      {isLoading && !d ? (
        <Skeleton rows={2} />
      ) : !primary ? (
        <Unavailable reason={res?.notice} />
      ) : (
        <>

          <div className="grid grid-cols-4 gap-1.5">
            <Metric label="미세" value={primary.pm10} unit="㎍/㎥" grade={primary.pm10Grade} />
            <Metric
              label="초미세"
              value={primary.pm25}
              unit="㎍/㎥"
              grade={primary.pm25Grade}
            />
            <Metric label="오존" value={primary.o3} unit="ppm" />
            <Metric label="통합" value={primary.khai} unit="CAI" grade={primary.khaiGrade} />
          </div>

          <p className="mt-2 text-[10.5px] text-[var(--muted)]">
            {primary.name} 측정소 · {primary.measuredAt || "시각 미상"}
          </p>

          {stations.length > 1 && (
            <ul className="mt-1.5 space-y-1 border-t border-[var(--border)] pt-1.5">
              {stations.slice(1).map((s) => (
                <li
                  key={s.name}
                  className="flex items-center gap-2 text-[11.5px]"
                >
                  <span className="font-semibold">{s.name}</span>
                  <span className="text-[var(--muted)]">
                    미세 {s.pm10 ?? "-"} · 초미세 {s.pm25 ?? "-"}
                  </span>
                  {s.pm25Grade && (
                    <span
                      className="ml-auto text-[10.5px] font-bold"
                      style={{ color: GRADE_STYLE[s.pm25Grade].color }}
                    >
                      {s.pm25Grade}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </Card>
  );
}
