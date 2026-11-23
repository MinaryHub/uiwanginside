"use client";

import { Section, Skeleton, Empty, LiveDot, Notice, Unavailable } from "@/components/ui";
import type { ApiEnvelope, SubwayArrival, SubwayPayload } from "@/lib/types";

function formatEta(item: SubwayArrival): { text: string; urgent: boolean } {
  if (item.arvlMsg) {
    const urgent = /도착|진입|전역/.test(item.arvlMsg) || (item.etaSec != null && item.etaSec <= 180);
    return { text: item.arvlMsg, urgent };
  }
  if (item.etaSec == null) return { text: "정보 없음", urgent: false };
  if (item.etaSec < 60) return { text: "곧 도착", urgent: true };
  const min = Math.round(item.etaSec / 60);
  return { text: `${min}분 후`, urgent: min <= 3 };
}

function DirectionCol({
  title,
  sub,
  items,
}: {
  title: string;
  sub: string;
  items: SubwayArrival[];
}) {
  return (
    <div className="rounded-[var(--radius)] bg-[var(--surface-2)] p-2.5">
      <div className="mb-1.5 flex items-baseline justify-between gap-1">
        <span className="text-[length:var(--text-xs)] font-extrabold text-[var(--info)]">
          {title}
        </span>
        <span className="truncate text-[length:var(--text-2xs)] text-[var(--text-muted)]">
          {sub}
        </span>
      </div>
      {items.length === 0 ? (
        <p className="py-1 text-[length:var(--text-2xs)] text-[var(--text-faint)]">
          도착 예정 없음
        </p>
      ) : (
        <ul className="space-y-1.5">
          {items.slice(0, 3).map((t) => {
            const eta = formatEta(t);
            const dest = t.trainLineNm.split("-")[0]?.trim() || t.trainLineNm;
            const isExpress = t.trainType.includes("급행") || t.trainType.includes("ITX");
            return (
              <li
                key={t.id}
                className="rounded-[8px] bg-[var(--surface)] px-2 py-1.5 text-[length:var(--text-xs)]"
              >
                <div className="flex items-center gap-1">
                  {isExpress && (
                    <span className="shrink-0 rounded bg-[var(--danger-soft)] px-1 text-[11px] font-extrabold text-[var(--danger)]">
                      급행
                    </span>
                  )}
                  <span className="min-w-0 flex-1 truncate font-bold">{dest}</span>
                  {t.isLast && (
                    <span className="shrink-0 rounded bg-[var(--warn-soft)] px-1 text-[11px] font-bold text-[var(--warn)]">
                      막차
                    </span>
                  )}
                </div>
                <p
                  className="tnum mt-0.5 truncate text-[length:var(--text-2xs)] font-bold"
                  style={{ color: eta.urgent ? "var(--danger)" : "var(--text-muted)" }}
                >
                  {eta.text}
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export default function SubwayPanel({
  res,
  isLoading,
  error,
  onFocusStation,
}: {
  res?: ApiEnvelope<SubwayPayload>;
  isLoading: boolean;
  error?: unknown;
  onFocusStation: (lat: number, lng: number) => void;
}) {
  const d = res?.data;

  return (
    <Section
      title="1호선 의왕역"
      right={
        <div className="flex items-center gap-2">
          {d && (
            <button
              type="button"
              onClick={() => onFocusStation(d.lat, d.lng)}
              className="rounded-full bg-[var(--surface-2)] px-2 py-0.5 text-[length:var(--text-2xs)] font-bold text-[var(--info)] hover:bg-[var(--surface-3)]"
            >
              역 위치 ↗
            </button>
          )}
          <LiveDot live={!!res?.ok && (d?.up.length ?? 0) + (d?.down.length ?? 0) > 0} />
        </div>
      }
    >
      {isLoading && !d ? (
        <Skeleton rows={2} />
      ) : !res?.ok ? (
        <Unavailable reason={res?.notice} error={error} />
      ) : !d || (d.up.length === 0 && d.down.length === 0) ? (
        <Empty>지금 의왕역에 도착 예정인 열차가 없습니다.</Empty>
      ) : (
        <div className="space-y-2">
          {res.notice && <Notice>{res.notice}</Notice>}
          <div className="grid grid-cols-2 gap-2">
            <DirectionCol title="▲ 상행" sub="서울·구로" items={d.up} />
            <DirectionCol title="▼ 하행" sub="수원·천안" items={d.down} />
          </div>
        </div>
      )}
    </Section>
  );
}
