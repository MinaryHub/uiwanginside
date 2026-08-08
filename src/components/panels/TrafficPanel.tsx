"use client";

import { Card, Notice, Skeleton, Badge, Empty, LiveDot, timeAgo } from "@/components/ui";
import type { TrafficPayload, ApiEnvelope, Incident } from "@/lib/types";

const KIND_META: Record<Incident["kind"], { label: string; color: string; emoji: string }> = {
  accident: { label: "사고", color: "#dc2626", emoji: "🚨" },
  construction: { label: "공사", color: "#d97706", emoji: "🚧" },
  closure: { label: "통제", color: "#7c2d12", emoji: "⛔" },
  weather: { label: "기상", color: "#2563eb", emoji: "🌧️" },
  etc: { label: "기타", color: "#6b7280", emoji: "❗" },
};

const LEVEL_META = {
  congested: { label: "정체", color: "#dc2626" },
  slow: { label: "서행", color: "#f59e0b" },
  smooth: { label: "원활", color: "#16a34a" },
} as const;

export default function TrafficPanel({
  res,
  isLoading,
  onFocus,
}: {
  res?: ApiEnvelope<TrafficPayload>;
  isLoading: boolean;
  onFocus: (lat: number, lng: number) => void;
}) {
  const d = res?.data;
  const incidents = d?.incidents ?? [];
  const links = d?.links ?? [];

  const counts = links.reduce(
    (acc, l) => ({ ...acc, [l.level]: (acc[l.level] ?? 0) + 1 }),
    {} as Record<string, number>,
  );

  return (
    <Card title="교통 · 사고" icon="🚗" right={<LiveDot live={d?.source === "its"} />}>
      {isLoading && !d ? (
        <Skeleton rows={3} />
      ) : (
        <>
          <Notice>{res?.notice}</Notice>

          {links.length > 0 && (
            <div className="mb-3 flex gap-1.5">
              {(["congested", "slow", "smooth"] as const).map((lv) => (
                <div
                  key={lv}
                  className="flex flex-1 flex-col items-center rounded-lg py-1.5"
                  style={{ background: `${LEVEL_META[lv].color}18` }}
                >
                  <span
                    className="text-base font-bold leading-none"
                    style={{ color: LEVEL_META[lv].color }}
                  >
                    {counts[lv] ?? 0}
                  </span>
                  <span className="mt-0.5 text-[10.5px] font-semibold text-[var(--muted)]">
                    {LEVEL_META[lv].label}
                  </span>
                </div>
              ))}
            </div>
          )}

          <h3 className="mb-1.5 text-[11px] font-bold text-[var(--muted)]">돌발상황</h3>
          {incidents.length === 0 ? (
            <Empty>현재 보고된 사고·통제가 없습니다 👍</Empty>
          ) : (
            <ul className="space-y-1.5">
              {incidents.slice(0, 8).map((inc) => {
                const m = KIND_META[inc.kind];
                const clickable = inc.lat != null && inc.lng != null;
                return (
                  <li key={inc.id}>
                    <button
                      type="button"
                      disabled={!clickable}
                      onClick={() => clickable && onFocus(inc.lat!, inc.lng!)}
                      className="w-full rounded-lg bg-[var(--surface-2)] px-2.5 py-2 text-left transition hover:brightness-95 disabled:cursor-default"
                    >
                      <div className="mb-0.5 flex items-center gap-1.5">
                        <Badge color={m.color} filled>
                          {m.emoji} {m.label}
                        </Badge>
                        <span className="truncate text-[11px] font-semibold text-[var(--muted)]">
                          {inc.road}
                        </span>
                        <span className="ml-auto shrink-0 text-[10.5px] text-[var(--muted)]">
                          {timeAgo(inc.startedAt)}
                        </span>
                      </div>
                      <p className="line-clamp-2 text-[12px] leading-snug">{inc.message}</p>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {links.length > 0 && (
            <>
              <h3 className="mb-1.5 mt-3 text-[11px] font-bold text-[var(--muted)]">
                정체 구간 TOP {Math.min(5, links.length)}
              </h3>
              <ul className="space-y-1">
                {links.slice(0, 5).map((l) => (
                  <li
                    key={l.id}
                    className="flex items-center gap-2 rounded-lg bg-[var(--surface-2)] px-2.5 py-1.5"
                  >
                    <span
                      className="h-1.5 w-1.5 shrink-0 rounded-full"
                      style={{ background: LEVEL_META[l.level].color }}
                    />
                    <span className="flex-1 truncate text-[12px]">{l.name}</span>
                    <span
                      className="shrink-0 text-[12px] font-bold"
                      style={{ color: LEVEL_META[l.level].color }}
                    >
                      {l.speed}
                      <span className="text-[9.5px] font-medium">km/h</span>
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}
    </Card>
  );
}
