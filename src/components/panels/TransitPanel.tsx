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
  alertOn,
  onTrack,
  onToggleAlert,
}: {
  a: BusArrival;
  tracked: boolean;
  alertOn: boolean;
  onTrack: () => void;
  onToggleAlert?: () => void;
}) {
  const first = eta(a.predictSec);
  const second = eta(a.predictSec2);
  const crowd = a.crowded ? BUS_CROWD[a.crowded] : null;

  return (
    <li className="flex items-center gap-1">
      <button
        type="button"
        onClick={onTrack}
        aria-pressed={tracked}
        title="지도에서 이 노선 버스 위치·경로 보기"
        className="min-h-[44px] min-w-0 flex-1 rounded-[var(--radius)] px-1.5 py-1.5 text-left transition hover:bg-[var(--surface-3)]"
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
            지도에 경로·위치 표시 중
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
      {onToggleAlert && a.predictSec != null && (
        <button
          type="button"
          aria-pressed={alertOn}
          aria-label={`${a.routeName}번 도착 알림 ${alertOn ? "해제" : "설정"}`}
          title={alertOn ? "도착 알림 해제" : "3분 전 도착 알림 설정"}
          onClick={onToggleAlert}
          className={`grid h-9 w-9 shrink-0 place-items-center rounded-[var(--radius)] border-2 text-[length:var(--text-xs)] transition ${
            alertOn
              ? "border-[var(--ink)] shadow-[var(--shadow-sm)]"
              : "border-transparent text-[var(--text-muted)] hover:bg-[var(--surface-3)]"
          }`}
          style={alertOn ? { background: "var(--brand-2)", color: "var(--ink)" } : undefined}
        >
          <span aria-hidden>{alertOn ? "🔔" : "🔕"}</span>
        </button>
      )}
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
  busAlert,
  onToggleAlert,
  savedStops = [],
  onFocusSavedStop,
  onToggleSaveStop,
  onRemoveSavedStop,
}: {
  res?: ApiEnvelope<TransitPayload>;
  isLoading: boolean;
  error?: unknown;
  onSelectStop: (s: BusStop) => void;
  /** 지도에 위치를 표시 중인 노선 */
  trackedRouteId: string | null;
  onTrackRoute: (routeId: string, routeName: string) => void;
  busAlert?: { stationId: string; routeId: string } | null;
  onToggleAlert?: (stop: BusStop, routeId: string, routeName: string, predictSec: number) => void;
  savedStops?: Array<{ stationId: string; name: string; mobileNo: string; lat: number; lng: number }>;
  onFocusSavedStop?: (stop: { stationId: string; name: string; mobileNo: string; lat: number; lng: number }) => void;
  onToggleSaveStop?: (stop: BusStop) => void;
  onRemoveSavedStop?: (stationId: string) => void;
}) {
  const d = res?.data;
  const stops = d?.stops ?? [];
  const positionOnly = d?.source === "osm";
  const savedSet = new Set(savedStops.map((s) => s.stationId));

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
      {/* 자주 타는 정류소 즐겨찾기 (로그인 없이 브라우저 저장) */}
      {savedStops.length > 0 && onFocusSavedStop && (
        <div className="mb-3 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--brand-soft)] p-2">
          <p className="mb-1.5 text-[length:var(--text-2xs)] font-extrabold text-[var(--brand)]">
            ⭐ 자주 타는 정류소
          </p>
          <div className="flex flex-wrap gap-1.5">
            {savedStops.map((st) => (
              <span
                key={st.stationId}
                className="inline-flex items-center overflow-hidden rounded-full border border-[var(--ink)] bg-[var(--surface)] shadow-[var(--shadow-sm)]"
              >
                <button
                  type="button"
                  onClick={() => onFocusSavedStop(st)}
                  className="px-2.5 py-1 text-[length:var(--text-2xs)] font-bold hover:bg-[var(--surface-2)]"
                >
                  {st.name}
                </button>
                {onRemoveSavedStop && (
                  <button
                    type="button"
                    onClick={() => onRemoveSavedStop(st.stationId)}
                    aria-label={`${st.name} 즐겨찾기 삭제`}
                    className="border-l border-[var(--border)] px-1.5 py-1 text-[11px] text-[var(--text-muted)] hover:bg-[var(--surface-2)]"
                  >
                    ✕
                  </button>
                )}
              </span>
            ))}
          </div>
        </div>
      )}

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
            const isSaved = savedSet.has(s.stationId);
            return (
              <div key={s.stationId} className="rounded-[var(--radius)] bg-[var(--surface-2)] p-2.5">
                <div className="mb-1 flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => onSelectStop(s)}
                    className="flex min-h-[36px] min-w-0 flex-1 items-center gap-1.5 text-left"
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
                  {onToggleSaveStop && (
                    <button
                      type="button"
                      onClick={() => onToggleSaveStop(s)}
                      aria-pressed={isSaved}
                      aria-label={isSaved ? "자주 타는 정류소 해제" : "자주 타는 정류소 저장"}
                      title={isSaved ? "자주 타는 정류소 해제" : "자주 타는 정류소 저장"}
                      className="grid h-9 w-9 shrink-0 place-items-center rounded-[var(--radius)] text-sm hover:bg-[var(--surface-3)]"
                    >
                      <span aria-hidden>{isSaved ? "⭐" : "☆"}</span>
                    </button>
                  )}
                </div>

                {s.arrivals && s.arrivals.length > 0 ? (
                  <ul className="divide-y divide-[var(--border)]">
                    {s.arrivals.map((a) => (
                      <ArrivalRow
                        key={`${s.stationId}-${a.routeId}-${a.destName}`}
                        a={a}
                        tracked={trackedRouteId === a.routeId}
                        alertOn={
                          busAlert?.stationId === s.stationId && busAlert?.routeId === a.routeId
                        }
                        onTrack={() => onTrackRoute(a.routeId, a.routeName)}
                        onToggleAlert={
                          onToggleAlert && a.predictSec != null
                            ? () => onToggleAlert(s, a.routeId, a.routeName, a.predictSec!)
                            : undefined
                        }
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
