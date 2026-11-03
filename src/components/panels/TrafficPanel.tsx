"use client";

import { Section, Skeleton, Badge, Empty, LiveDot, Unavailable, timeAgo } from "@/components/ui";
import type { TrafficPayload, ApiEnvelope, Incident } from "@/lib/types";

type Tone = "danger" | "warn" | "info" | "neutral";

const KIND_META: Record<Incident["kind"], { label: string; tone: Tone; emoji: string }> = {
  accident: { label: "사고", tone: "danger", emoji: "🚨" },
  construction: { label: "공사", tone: "warn", emoji: "🚧" },
  closure: { label: "통제", tone: "danger", emoji: "⛔" },
  weather: { label: "기상", tone: "info", emoji: "🌧️" },
  etc: { label: "기타", tone: "neutral", emoji: "❗" },
};

const LEVEL_META = {
  congested: { label: "정체", color: "var(--danger)" },
  slow: { label: "서행", color: "var(--warn)" },
  smooth: { label: "원활", color: "var(--ok)" },
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
    <Section title="교통 · 사고" right={<LiveDot live={d?.source === "its"} />}>
      {isLoading && !d ? (
        <Skeleton rows={3} />
      ) : res?.ok === false ? (
        <Unavailable reason={res.notice} />
      ) : (
        <>
          {links.length > 0 && (
            <div className="mb-3 flex gap-1.5">
              {(["congested", "slow", "smooth"] as const).map((lv) => (
                <div
                  key={lv}
                  className="flex flex-1 flex-col items-center rounded-[var(--radius)] py-1.5"
                  style={{ background: `${LEVEL_META[lv].color}18` }}
                >
                  <span
                    className="text-base font-bold leading-none"
                    style={{ color: LEVEL_META[lv].color }}
                  >
                    {counts[lv] ?? 0}
                  </span>
                  <span className="mt-0.5 text-[length:var(--text-2xs)] font-semibold text-[var(--text-muted)]">
                    {LEVEL_META[lv].label}
                  </span>
                </div>
              ))}
            </div>
          )}

          <h3 className="mb-1.5 text-[length:var(--text-xs)] font-bold text-[var(--text-muted)]">돌발상황</h3>
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
                      className="w-full rounded-[var(--radius)] bg-[var(--surface-2)] px-2.5 py-2 text-left transition hover:brightness-95 disabled:cursor-default"
                    >
                      <div className="mb-0.5 flex items-center gap-1.5">
                        <Badge tone={m.tone} filled>
                          {m.emoji} {m.label}
                        </Badge>
                        <span className="truncate text-[length:var(--text-xs)] font-semibold text-[var(--text-muted)]">
                          {inc.road}
                        </span>
                        <span className="ml-auto shrink-0 text-[length:var(--text-2xs)] text-[var(--text-muted)]">
                          {timeAgo(inc.startedAt)}
                        </span>
                      </div>
                      <p className="line-clamp-2 text-[length:var(--text-xs)] leading-snug">{inc.message}</p>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {links.length > 0 && (
            <>
              <h3 className="mb-1.5 mt-3 text-[length:var(--text-xs)] font-bold text-[var(--text-muted)]">
                느린 도로 {Math.min(6, links.length)}곳
              </h3>
              <ul className="space-y-1">
                {links.slice(0, 6).map((l) => (
                  <li
                    key={l.id}
                    className="flex items-center gap-2 rounded-[var(--radius)] bg-[var(--surface-2)] px-2.5 py-1.5"
                  >
                    <span
                      className="h-1.5 w-1.5 shrink-0 rounded-full"
                      style={{ background: LEVEL_META[l.level].color }}
                    />
                    <span className="flex-1 truncate text-[length:var(--text-xs)]">{l.name}</span>
                    <span
                      className="shrink-0 text-[length:var(--text-xs)] font-bold"
                      style={{ color: LEVEL_META[l.level].color }}
                    >
                      {l.speed}
                      <span className="text-[length:var(--text-2xs)] font-medium">km/h</span>
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}
    </Section>
  );
}
