"use client";

import { Card, Skeleton, Empty, LiveDot, Unavailable } from "@/components/ui";
import type { TransitPayload, ApiEnvelope, BusArrival } from "@/lib/types";

/**
 * 남은 시간에 따라 색을 달리해 "지금 뛰어야 하는지" 를 한눈에 보이게 한다.
 * null 은 운행 정보가 없다는 뜻이므로 절대 "곧 도착" 으로 보여선 안 된다.
 */
function eta(sec: number | null) {
  if (sec == null) return { text: "운행없음", color: "var(--muted)" };
  const min = Math.floor(sec / 60);
  if (min < 1) return { text: "곧 도착", color: "#dc2626" };
  if (min <= 3) return { text: `${min}분`, color: "#dc2626" };
  if (min <= 7) return { text: `${min}분`, color: "#ea580c" };
  return { text: `${min}분`, color: "var(--foreground)" };
}

const CROWD: Record<number, { label: string; color: string }> = {
  1: { label: "여유", color: "#16a34a" },
  2: { label: "보통", color: "#f59e0b" },
  3: { label: "혼잡", color: "#dc2626" },
  4: { label: "매우혼잡", color: "#991b1b" },
};

function ArrivalRow({ a }: { a: BusArrival }) {
  const first = eta(a.predictSec);
  const second = eta(a.predictSec2);
  const crowd = a.crowded ? CROWD[a.crowded] : null;

  return (
    <li className="py-1">
      <div className="flex items-center gap-1.5">
        <span className="w-12 shrink-0 truncate text-[12.5px] font-extrabold text-blue-600 dark:text-blue-400">
          {a.routeName}
        </span>
        {a.destName && (
          <span className="min-w-0 flex-1 truncate text-[10.5px] text-[var(--muted)]">
            {a.destName} 방면
          </span>
        )}
        <span
          className="ml-auto shrink-0 text-[13px] font-extrabold tabular-nums"
          style={{ color: first.color }}
        >
          {first.text}
        </span>
        <span className="w-8 shrink-0 text-right text-[10.5px] text-[var(--muted)] tabular-nums">
          {a.predictSec2 != null ? second.text : ""}
        </span>
      </div>

      {/* 부가 정보는 있을 때만 — 없는 값을 자리만 차지하게 두지 않는다 */}
      {(a.stationsLeft != null || crowd || a.remainSeats != null || a.lowPlate) && (
        <div className="mt-0.5 flex items-center gap-1.5 pl-[54px]">
          {a.stationsLeft != null && a.stationsLeft > 0 && (
            <span className="text-[10px] text-[var(--muted)]">
              {a.stationsLeft}번째 전
            </span>
          )}
          {crowd && (
            <span className="text-[10px] font-bold" style={{ color: crowd.color }}>
              {crowd.label}
            </span>
          )}
          {a.remainSeats != null && (
            <span className="text-[10px] text-[var(--muted)]">좌석 {a.remainSeats}</span>
          )}
          {a.lowPlate && (
            <span className="rounded bg-green-600/15 px-1 text-[9.5px] font-bold text-green-700 dark:text-green-400">
              저상
            </span>
          )}
        </div>
      )}
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
  const positionOnly = d?.source === "osm";

  return (
    <Card
      title="버스 도착"
      icon="🚌"
      right={
        positionOnly ? (
          <span
            title="정류소 위치만 실제 데이터 · 도착 시간은 표시할 수 없음"
            className="text-[10.5px] font-bold text-blue-500"
          >
            위치만
          </span>
        ) : (
          <LiveDot live={d?.source === "gbis"} />
        )
      }
    >
      {isLoading && !d ? (
        <Skeleton rows={3} />
      ) : res?.ok === false ? (
        <Unavailable reason={res.notice} />
      ) : stops.length === 0 ? (
        <Empty>주변 정류소가 없습니다.</Empty>
      ) : (
        <div className="space-y-2">
          {stops.map((s) => (
            <div key={s.stationId} className="rounded-lg bg-[var(--surface-2)] p-2.5">
              <button
                type="button"
                onClick={() => onFocus(s.lat, s.lng)}
                className="mb-1 flex w-full items-center gap-1.5 text-left"
              >
                <span className="truncate text-[12.5px] font-bold">{s.name}</span>
                {s.mobileNo && (
                  <span
                    title="정류소 번호 (표지판에 적힌 숫자)"
                    className="shrink-0 rounded bg-[var(--surface)] px-1 text-[10px] font-semibold text-[var(--muted)]"
                  >
                    {s.mobileNo}
                  </span>
                )}
                {s.distance != null && (
                  <span className="ml-auto shrink-0 text-[10.5px] text-[var(--muted)]">
                    {s.distance >= 1000
                      ? `${(s.distance / 1000).toFixed(1)}km`
                      : `${s.distance}m`}
                  </span>
                )}
              </button>

              {s.arrivals && s.arrivals.length > 0 ? (
                <ul className="divide-y divide-[var(--border)]">
                  {s.arrivals.map((a) => (
                    <ArrivalRow key={`${s.stationId}-${a.routeId}-${a.destName}`} a={a} />
                  ))}
                </ul>
              ) : (
                <p className="py-1 text-[11.5px] text-[var(--muted)]">
                  {positionOnly ? "도착정보 미연동" : "지금 운행 중인 버스가 없습니다"}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
