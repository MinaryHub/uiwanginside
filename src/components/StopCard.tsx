"use client";

import MapCard from "@/components/MapCard";
import { Empty } from "@/components/ui";
import { BUS_CROWD, formatDistance } from "@/lib/format";
import type { BusStop } from "@/lib/types";

/** 남은 시간에 따라 색을 달리해 "지금 뛰어야 하는지" 를 한눈에 */
function eta(sec: number | null) {
  if (sec == null) return { text: "운행없음", color: "var(--text-faint)" };
  const min = Math.floor(sec / 60);
  if (min < 1) return { text: "곧 도착", color: "var(--danger)" };
  if (min <= 3) return { text: `${min}분`, color: "var(--danger)" };
  if (min <= 7) return { text: `${min}분`, color: "var(--warn)" };
  return { text: `${min}분`, color: "var(--text)" };
}

/**
 * 지도에서 정류소를 누르면 뜨는 카드.
 * 도착 시간을 보여주고, 노선을 누르면 그 버스가 어디 있는지 지도에 띄운다.
 */
export default function StopCard({
  stop,
  trackedRouteId,
  onTrackRoute,
  busAlert,
  onToggleAlert,
  onClose,
}: {
  stop: BusStop;
  trackedRouteId: string | null;
  onTrackRoute: (routeId: string, routeName: string) => void;
  busAlert?: { stationId: string; routeId: string } | null;
  onToggleAlert?: (stop: BusStop, routeId: string, routeName: string, predictSec: number) => void;
  onClose: () => void;
}) {
  const arrivals = stop.arrivals ?? [];
  const distance = formatDistance(stop.distance);

  return (
    <MapCard
      title={stop.name}
      accent="var(--info)"
      onClose={onClose}
      subtitle={
        <span className="flex items-center gap-1.5">
          <span>정류소</span>
          {stop.mobileNo && (
            <span
              title="정류소 번호 (표지판에 적힌 숫자)"
              className="tnum rounded-[5px] bg-[var(--surface-3)] px-1.5 font-bold"
            >
              {stop.mobileNo}
            </span>
          )}
          {distance && <span>· {distance}</span>}
        </span>
      }
    >
      {arrivals.length === 0 ? (
        <Empty>지금 도착 예정인 버스가 없습니다.</Empty>
      ) : (
        <ul className="mt-3 divide-y divide-[var(--border)]">
          {arrivals.map((a) => {
            const first = eta(a.predictSec);
            const second = eta(a.predictSec2);
            const crowd = a.crowded ? BUS_CROWD[a.crowded] : null;
            const on = trackedRouteId === a.routeId;
            const alertOn =
              busAlert?.stationId === stop.stationId && busAlert?.routeId === a.routeId;
            return (
              <li key={`${a.routeId}-${a.destName}`} className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => onTrackRoute(a.routeId, a.routeName)}
                  aria-pressed={on}
                  title="지도에서 이 노선 버스 위치·경로 보기"
                  className="min-h-[48px] min-w-0 flex-1 rounded-[var(--radius)] px-1.5 py-2 text-left transition hover:bg-[var(--surface-2)]"
                  style={on ? { background: "var(--brand-soft)" } : undefined}
                >
                  <div className="flex items-center gap-2">
                    <span className="w-12 shrink-0 truncate text-[length:var(--text-sm)] font-bold text-[var(--info)]">
                      {a.routeName}
                    </span>
                    {a.destName && (
                      <span className="min-w-0 flex-1 truncate text-[length:var(--text-2xs)] text-[var(--text-muted)]">
                        {a.destName} 방면
                      </span>
                    )}
                    <span
                      className="tnum ml-auto shrink-0 text-[length:var(--text-base)] font-bold"
                      style={{ color: first.color }}
                    >
                      {first.text}
                    </span>
                    <span className="tnum w-9 shrink-0 text-right text-[length:var(--text-2xs)] text-[var(--text-faint)]">
                      {a.predictSec2 != null ? second.text : ""}
                    </span>
                  </div>

                  {(a.stationsLeft || crowd || a.remainSeats != null || a.lowPlate || on) && (
                    <div className="mt-1 flex flex-wrap items-center gap-2 pl-[56px] text-[length:var(--text-2xs)] text-[var(--text-muted)]">
                      {a.stationsLeft != null && a.stationsLeft > 0 && (
                        <span>{a.stationsLeft}번째 전</span>
                      )}
                      {crowd && (
                        <span className="font-bold" style={{ color: crowd.color }}>
                          {crowd.label}
                        </span>
                      )}
                      {a.remainSeats != null && <span>좌석 {a.remainSeats}</span>}
                      {a.lowPlate && (
                        <span className="rounded bg-[var(--ok-soft)] px-1 font-bold text-[var(--ok)]">
                          저상
                        </span>
                      )}
                      {on && (
                        <span className="ml-auto font-bold text-[var(--brand)]">
                          경로·위치 표시 중
                        </span>
                      )}
                    </div>
                  )}
                </button>
                {onToggleAlert && a.predictSec != null && (
                  <button
                    type="button"
                    aria-pressed={alertOn}
                    aria-label={`${a.routeName}번 도착 알림 ${alertOn ? "해제" : "설정"}`}
                    title={alertOn ? "도착 알림 해제" : "3분 전 도착 알림 설정"}
                    onClick={() => onToggleAlert(stop, a.routeId, a.routeName, a.predictSec!)}
                    className={`grid h-10 w-10 shrink-0 place-items-center rounded-[var(--radius)] border-2 text-[length:var(--text-sm)] transition ${
                      alertOn
                        ? "border-[var(--ink)] shadow-[var(--shadow-sm)]"
                        : "border-transparent text-[var(--text-muted)] hover:bg-[var(--surface-2)]"
                    }`}
                    style={alertOn ? { background: "var(--brand-2)", color: "var(--ink)" } : undefined}
                  >
                    <span aria-hidden>{alertOn ? "🔔" : "🔕"}</span>
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </MapCard>
  );
}
