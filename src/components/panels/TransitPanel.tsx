"use client";

import { Section, Skeleton, Empty, LiveDot, Notice, Unavailable } from "@/components/ui";
import { BUS_CROWD, formatDistance } from "@/lib/format";
import type { TransitPayload, ApiEnvelope, BusArrival, BusStop } from "@/lib/types";

/**
 * 남은 시간에 따라 색을 달리해 "지금 뛰어야 하는지" 를 한눈에 보이게 한다.
 * null 은 운행 정보가 없다는 뜻이므로 절대 "곧 도착" 으로 보여선 안 된다.
 */
function eta(sec: number | null) {
  if (sec == null) return { text: "운행없음", color: "var(--text-muted)" };
  const min = Math.floor(sec / 60);
  if (min < 1) return { text: "곧 도착", color: "var(--danger)" };
  if (min <= 3) return { text: `${min}분`, color: "var(--danger)" };
  if (min <= 7) return { text: `${min}분`, color: "var(--warn)" };
  return { text: `${min}분`, color: "var(--text)" };
}

function ArrivalRow({
  a,
  tracked,
  onTrack,
}: {
  a: BusArrival;
  tracked: boolean;
  onTrack: () => void;
}) {
  const first = eta(a.predictSec);
  const second = eta(a.predictSec2);
  const crowd = a.crowded ? BUS_CROWD[a.crowded] : null;

  return (
    <li>
      <button
        type="button"
        onClick={onTrack}
        aria-pressed={tracked}
        title="지도에서 이 노선 버스 위치 보기"
        className="min-h-[44px] w-full rounded-[var(--radius)] px-1.5 py-1.5 text-left transition hover:bg-[var(--surface-3)]"
        style={tracked ? { background: "var(--brand-soft)" } : undefined}
      >
        <div className="flex items-center gap-1.5">
          <span className="w-12 shrink-0 truncate text-[length:var(--text-sm)] font-bold text-[var(--info)]">
            {a.routeName}
          </span>
          {a.destName && (
            <span className="min-w-0 flex-1 truncate text-[length:var(--text-2xs)] text-[var(--text-muted)]">
              {a.destName} 방면
            </span>
          )}
          <span
            className="ml-auto shrink-0 text-[length:var(--text-sm)] font-bold tabular-nums"
            style={{ color: first.color }}
          >
            {first.text}
          </span>
          <span className="w-8 shrink-0 text-right text-[length:var(--text-2xs)] tabular-nums text-[var(--text-muted)]">
            {a.predictSec2 != null ? second.text : ""}
          </span>
        </div>

        {tracked && (
          <div className="mt-0.5 pl-[54px] text-[length:var(--text-2xs)] font-bold text-[var(--brand)]">
            지도에서 위치 표시 중
          </div>
        )}

        {/* 부가 정보는 있을 때만 — 없는 값을 자리만 차지하게 두지 않는다 */}
        {(a.stationsLeft != null || crowd || a.remainSeats != null || a.lowPlate) && (
          <div className="mt-0.5 flex flex-wrap items-center gap-1.5 pl-[54px]">
            {a.stationsLeft != null && a.stationsLeft > 0 && (
              <span className="text-[length:var(--text-2xs)] text-[var(--text-muted)]">
                {a.stationsLeft}번째 전
              </span>
            )}
            {crowd && (
              <span className="text-[length:var(--text-2xs)] font-bold" style={{ color: crowd.color }}>
                {crowd.label}
              </span>
            )}
            {a.remainSeats != null && (
              <span className="text-[length:var(--text-2xs)] text-[var(--text-muted)]">
                좌석 {a.remainSeats}
              </span>
            )}
            {a.lowPlate && (
              <span className="rounded bg-[var(--ok-soft)] px-1 text-[length:var(--text-2xs)] font-bold text-[var(--ok)]">
                저상
              </span>
            )}
          </div>
        )}
      </button>
    </li>
  );
}

export default function TransitPanel({
  res,
  isLoading,
  error,
  onSelectStop,
  trackedRouteId,
  onTrackRoute,
}: {
  res?: ApiEnvelope<TransitPayload>;
  isLoading: boolean;
  error?: unknown;
  onSelectStop: (s: BusStop) => void;
  /** 지도에 위치를 표시 중인 노선 */
  trackedRouteId: string | null;
  onTrackRoute: (routeId: string, routeName: string) => void;
}) {
  const d = res?.data;
  const stops = d?.stops ?? [];
  const positionOnly = d?.source === "osm";

  return (
    <Section
      title="버스 도착"
      right={
        positionOnly ? (
          <span
            title="정류소 위치만 실제 데이터 · 도착 시간은 표시할 수 없음"
            className="text-[length:var(--text-2xs)] font-bold text-[var(--info)]"
          >
            위치만
          </span>
        ) : (
          <LiveDot live={d?.source === "gbis" && !!res?.ok} />
        )
      }
    >
      {isLoading && !d ? (
        <Skeleton rows={3} />
      ) : !res?.ok ? (
        <Unavailable reason={res?.notice} error={error} />
      ) : stops.length === 0 ? (
        <Empty>주변 정류소가 없습니다.</Empty>
      ) : (
        <div className="space-y-2">
          {res.notice && <Notice>{res.notice}</Notice>}
          {stops.map((s) => {
            const dist = formatDistance(s.distance);
            return (
              <div key={s.stationId} className="rounded-[var(--radius)] bg-[var(--surface-2)] p-2.5">
                <button
                  type="button"
                  onClick={() => onSelectStop(s)}
                  className="mb-1 flex min-h-[36px] w-full items-center gap-1.5 text-left"
                >
                  <span className="truncate text-[length:var(--text-sm)] font-bold">{s.name}</span>
                  {s.mobileNo && (
                    <span
                      title="정류소 번호 (표지판에 적힌 숫자)"
                      className="shrink-0 rounded bg-[var(--surface)] px-1 text-[length:var(--text-2xs)] font-semibold text-[var(--text-muted)]"
                    >
                      {s.mobileNo}
                    </span>
                  )}
                  {dist && (
                    <span className="ml-auto shrink-0 tabular-nums text-[length:var(--text-2xs)] text-[var(--text-muted)]">
                      {dist}
                    </span>
                  )}
                </button>

                {s.arrivals && s.arrivals.length > 0 ? (
                  <ul className="divide-y divide-[var(--border)]">
                    {s.arrivals.map((a) => (
                      <ArrivalRow
                        key={`${s.stationId}-${a.routeId}-${a.destName}`}
                        a={a}
                        tracked={trackedRouteId === a.routeId}
                        onTrack={() => onTrackRoute(a.routeId, a.routeName)}
                      />
                    ))}
                  </ul>
                ) : (
                  <p className="py-1 text-[length:var(--text-xs)] text-[var(--text-muted)]">
                    {positionOnly ? "도착정보 미연동" : "지금 운행 중인 버스가 없습니다"}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Section>
  );
}
