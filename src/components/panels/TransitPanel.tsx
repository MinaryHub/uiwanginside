"use client";

import { Card, Notice, Skeleton, Empty, LiveDot } from "@/components/ui";
import type { TransitPayload, ApiEnvelope, BusArrival } from "@/lib/types";

function eta(sec: number | null) {
  if (sec == null) return { text: "정보없음", color: "var(--muted)" };
  const min = Math.max(0, Math.round(sec / 60));
  if (min <= 1) return { text: "곧 도착", color: "#dc2626" };
  if (min <= 5) return { text: `${min}분`, color: "#ea580c" };
  return { text: `${min}분`, color: "var(--foreground)" };
}

function ArrivalRow({ a }: { a: BusArrival }) {
  const first = eta(a.predictSec);
  const second = eta(a.predictSec2);
  return (
    <li className="flex items-center gap-2 py-1">
      <span className="w-14 shrink-0 truncate text-[12.5px] font-bold text-blue-600 dark:text-blue-400">
        {a.routeName}
      </span>
      {a.lowPlate && (
        <span className="shrink-0 rounded bg-green-600/15 px-1 text-[9.5px] font-bold text-green-700 dark:text-green-400">
          저상
        </span>
      )}
      <span className="ml-auto shrink-0 text-[12.5px] font-bold" style={{ color: first.color }}>
        {first.text}
      </span>
      <span className="w-10 shrink-0 text-right text-[11px] text-[var(--muted)]">
        {a.predictSec2 != null ? second.text : ""}
      </span>
    </li>
  );
}

export default function TransitPanel({
  res,
  isLoading,
  onFocus,
}: {
  res?: ApiEnvelope<TransitPayload>;
  isLoading: boolean;
  onFocus: (lat: number, lng: number) => void;
}) {
  const d = res?.data;
  const stops = d?.stops ?? [];

  return (
    <Card title="대중교통" icon="🚌" right={<LiveDot live={d?.source === "gbis"} />}>
      {isLoading && !d ? (
        <Skeleton rows={3} />
      ) : (
        <>
          <Notice>{res?.notice}</Notice>
          {stops.length === 0 ? (
            <Empty>주변 정류소가 없습니다.</Empty>
          ) : (
            <div className="space-y-2.5">
              {stops.map((s) => (
                <div key={s.stationId} className="rounded-lg bg-[var(--surface-2)] p-2.5">
                  <button
                    type="button"
                    onClick={() => onFocus(s.lat, s.lng)}
                    className="mb-1 flex w-full items-center gap-1.5 text-left"
                  >
                    <span className="truncate text-[12.5px] font-bold">{s.name}</span>
                    {s.mobileNo && (
                      <span className="shrink-0 rounded bg-[var(--surface)] px-1 text-[10px] font-semibold text-[var(--muted)]">
                        {s.mobileNo}
                      </span>
                    )}
                    {s.distance != null && (
                      <span className="ml-auto shrink-0 text-[10.5px] text-[var(--muted)]">
                        {s.distance}m
                      </span>
                    )}
                  </button>
                  {s.arrivals && s.arrivals.length > 0 ? (
                    <ul className="divide-y divide-[var(--border)]">
                      {s.arrivals.map((a) => (
                        <ArrivalRow key={`${s.stationId}-${a.routeId}`} a={a} />
                      ))}
                    </ul>
                  ) : (
                    <p className="py-1 text-[11.5px] text-[var(--muted)]">
                      운행 중인 버스 정보가 없습니다.
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </Card>
  );
}
