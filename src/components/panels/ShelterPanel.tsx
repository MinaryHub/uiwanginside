"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import { Section, Skeleton, Empty, LiveDot, Unavailable } from "@/components/ui";
import type { ApiEnvelope, ShelterItem, ShelterKind, SheltersPayload } from "@/lib/types";

const noopSubscribe = () => () => {};

/** 계절에 맞는 기본 쉼터 종류: 11~3월 한파쉼터, 그 외 무더위쉼터 */
function defaultSeasonalKind(): ShelterKind {
  const m = new Date(Date.now() + 9 * 3600_000).getUTCMonth() + 1;
  return m >= 11 || m <= 3 ? "cold" : "heat";
}

const KIND_META: Record<ShelterKind, { label: string; emoji: string }> = {
  heat: { label: "무더위쉼터", emoji: "🏖️" },
  cold: { label: "한파쉼터", emoji: "❄️" },
  quake: { label: "지진대피", emoji: "⛺" },
};

export default function ShelterPanel({
  res,
  isLoading,
  error,
  onSelect,
}: {
  res?: ApiEnvelope<SheltersPayload>;
  isLoading: boolean;
  error?: unknown;
  onSelect: (s: ShelterItem) => void;
}) {
  const seasonal = useSyncExternalStore(noopSubscribe, defaultSeasonalKind, () => "heat" as const);
  const [pickedKind, setPickedKind] = useState<ShelterKind | "all" | null>(null);
  const [limit, setLimit] = useState(20);

  const shelters = useMemo(() => res?.data.shelters ?? [], [res]);

  const counts = useMemo(() => {
    const m: Record<ShelterKind, number> = { heat: 0, cold: 0, quake: 0 };
    for (const s of shelters) m[s.kind] += 1;
    return m;
  }, [shelters]);

  // 계절 기본 종류에 데이터가 없으면 있는 종류(또는 전체)로 자연스럽게 전환
  const effectiveKind: ShelterKind | "all" =
    pickedKind ?? (counts[seasonal] > 0 ? seasonal : "all");

  const shown = useMemo(
    () =>
      effectiveKind === "all"
        ? shelters
        : shelters.filter((s) => s.kind === effectiveKind),
    [shelters, effectiveKind],
  );

  const visible = shown.slice(0, limit);
  const more = shown.length - visible.length;

  return (
    <Section
      title="무더위 · 한파 쉼터"
      right={<LiveDot live={!!res?.ok && shelters.length > 0} />}
    >
      {isLoading && !res ? (
        <Skeleton rows={3} />
      ) : !res?.ok ? (
        <Unavailable reason={res?.notice} error={error} />
      ) : shelters.length === 0 ? (
        <Empty>등록된 의왕시 쉼터가 없습니다.</Empty>
      ) : (
        <>
          <div className="mb-2 flex flex-wrap gap-1">
            {(["all", "heat", "cold", "quake"] as const).map((k) => {
              if (k !== "all" && counts[k] === 0) return null;
              const on = effectiveKind === k;
              const label =
                k === "all"
                  ? `전체 ${shelters.length}`
                  : `${KIND_META[k].label} ${counts[k]}`;
              return (
                <button
                  key={k}
                  type="button"
                  aria-pressed={on}
                  onClick={() => {
                    setPickedKind(k);
                    setLimit(20);
                  }}
                  className={`min-h-[34px] rounded-full border-2 px-2.5 py-0.5 text-[length:var(--text-2xs)] font-bold transition ${
                    on
                      ? "border-[var(--ink)] shadow-[var(--shadow-sm)]"
                      : "border-transparent text-[var(--text-muted)] hover:bg-[var(--surface-2)]"
                  }`}
                  style={on ? { background: "var(--brand-2)", color: "var(--ink)" } : undefined}
                >
                  {label}
                </button>
              );
            })}
          </div>

          {visible.length === 0 ? (
            <Empty>선택한 유형의 쉼터가 없습니다.</Empty>
          ) : (
            <>
              <ul className="thin-scroll max-h-[260px] space-y-1 overflow-y-auto">
                {visible.map((s) => {
                  const meta = KIND_META[s.kind];
                  return (
                    <li key={s.id}>
                      <button
                        type="button"
                        onClick={() => onSelect(s)}
                        className="w-full rounded-[var(--radius)] bg-[var(--surface-2)] px-2.5 py-2 text-left transition hover:brightness-95"
                      >
                        <div className="flex items-center gap-1.5">
                          <span aria-hidden>{meta.emoji}</span>
                          <span className="min-w-0 flex-1 truncate text-[length:var(--text-sm)] font-bold">
                            {s.name}
                          </span>
                          {s.capacity && (
                            <span className="tnum shrink-0 text-[length:var(--text-2xs)] font-semibold text-[var(--text-muted)]">
                              {s.capacity}명
                            </span>
                          )}
                        </div>
                        <p className="mt-0.5 truncate pl-5 text-[length:var(--text-2xs)] text-[var(--text-muted)]">
                          {[s.dong, s.facilityType, s.coolingInfo].filter(Boolean).join(" · ") ||
                            s.address}
                        </p>
                      </button>
                    </li>
                  );
                })}
              </ul>
              {more > 0 && (
                <button
                  type="button"
                  onClick={() => setLimit((n) => n + 25)}
                  className="mt-2 min-h-[40px] w-full rounded-[var(--radius)] border border-[var(--border-strong)] text-[length:var(--text-xs)] font-bold transition hover:border-[var(--brand)] hover:text-[var(--brand)]"
                >
                  {more}곳 더 보기
                </button>
              )}
            </>
          )}
        </>
      )}
    </Section>
  );
}
