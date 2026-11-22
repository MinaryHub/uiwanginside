"use client";

import { useMemo, useState } from "react";
import { Section, Skeleton, Empty, LiveDot, Unavailable } from "@/components/ui";
import type { ApiEnvelope, EvChargersPayload, EvStation } from "@/lib/types";

type Filter = "available" | "fast" | "all";

const FILTERS: [Filter, string][] = [
  ["available", "충전 가능"],
  ["fast", "급속"],
  ["all", "전체"],
];

export default function EvChargersPanel({
  res,
  isLoading,
  error,
  onSelect,
}: {
  res?: ApiEnvelope<EvChargersPayload>;
  isLoading: boolean;
  error?: unknown;
  onSelect: (s: EvStation) => void;
}) {
  const [filter, setFilter] = useState<Filter>("available");
  const [keyword, setKeyword] = useState("");
  const [limit, setLimit] = useState(25);

  const stations = useMemo(() => res?.data.stations ?? [], [res]);

  const totals = useMemo(() => {
    let available = 0;
    let total = 0;
    for (const s of stations) {
      available += s.available;
      total += s.total;
    }
    return { available, total };
  }, [stations]);

  const shown = useMemo(() => {
    const q = keyword.trim().toLowerCase();
    return stations.filter((s) => {
      if (filter === "available" && s.available <= 0) return false;
      if (filter === "fast" && s.fastCount <= 0) return false;
      if (!q) return true;
      return (
        s.name.toLowerCase().includes(q) ||
        s.address.toLowerCase().includes(q) ||
        s.operator.toLowerCase().includes(q) ||
        s.dong.toLowerCase().includes(q)
      );
    });
  }, [stations, filter, keyword]);

  const visible = shown.slice(0, limit);
  const more = shown.length - visible.length;

  return (
    <Section
      title="전기차 충전소"
      right={<LiveDot live={res?.data.source === "keco" && !!res?.ok} />}
    >
      {isLoading && !res ? (
        <Skeleton rows={3} />
      ) : !res?.ok ? (
        <Unavailable reason={res?.notice} error={error} />
      ) : stations.length === 0 ? (
        <Empty>의왕시 전기차 충전소 정보를 찾지 못했습니다.</Empty>
      ) : (
        <>
          <div className="mb-2 flex flex-wrap items-center gap-1.5">
            <span className="text-[length:var(--text-xs)] font-bold">
              지금 <span className="tnum text-[var(--ok)]">{totals.available}</span>/{totals.total}기 가능
            </span>
            <div className="ml-auto flex gap-1">
              {FILTERS.map(([k, label]) => {
                const on = filter === k;
                return (
                  <button
                    key={k}
                    type="button"
                    aria-pressed={on}
                    onClick={() => {
                      setFilter(k);
                      setLimit(25);
                    }}
                    className={`min-h-[34px] rounded-[var(--radius)] border-2 px-2 py-0.5 text-[length:var(--text-2xs)] font-bold transition ${
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
          </div>

          <input
            value={keyword}
            aria-label="충전소 이름·주소·운영기관 검색"
            onChange={(e) => {
              setKeyword(e.target.value);
              setLimit(25);
            }}
            placeholder="충전소 이름·동·운영기관으로 찾기"
            className="mb-2 min-h-[40px] w-full rounded-[var(--radius-full)] border border-transparent bg-[var(--surface-2)] px-3.5 text-[length:var(--text-xs)] outline-none transition focus:border-[var(--brand-2)] focus:bg-[var(--surface)]"
          />

          {visible.length === 0 ? (
            <Empty>조건에 맞는 충전소가 없습니다.</Empty>
          ) : (
            <>
              <ul className="thin-scroll max-h-[280px] space-y-1 overflow-y-auto">
                {visible.map((s) => {
                  const hasAvail = s.available > 0;
                  return (
                    <li key={s.id}>
                      <button
                        type="button"
                        onClick={() => onSelect(s)}
                        className="w-full rounded-[var(--radius)] bg-[var(--surface-2)] px-2.5 py-2 text-left transition hover:brightness-95"
                      >
                        <div className="flex items-center gap-1.5">
                          <span aria-hidden>⚡</span>
                          <span className="min-w-0 flex-1 truncate text-[length:var(--text-sm)] font-bold">
                            {s.name}
                          </span>
                          <span
                            className="tnum shrink-0 rounded-full px-2 py-0.5 text-[length:var(--text-2xs)] font-extrabold"
                            style={
                              hasAvail
                                ? { background: "var(--ok-soft)", color: "var(--ok)" }
                                : { background: "var(--surface-3)", color: "var(--text-muted)" }
                            }
                          >
                            {s.available}/{s.total} 가능
                          </span>
                        </div>
                        <p className="mt-0.5 flex flex-wrap items-center gap-1.5 pl-5 text-[length:var(--text-2xs)] text-[var(--text-muted)]">
                          {s.fastCount > 0 && (
                            <span className="font-bold text-[var(--brand)]">
                              급속 {s.fastCount}
                              {s.maxOutputKw ? ` (${s.maxOutputKw}kW)` : ""}
                            </span>
                          )}
                          {s.slowCount > 0 && <span>완속 {s.slowCount}</span>}
                          {s.parkingFree === true && (
                            <span className="font-semibold text-[var(--ok)]">무료주차</span>
                          )}
                          {s.limitYn && <span className="text-[var(--warn)]">이용제한</span>}
                          {s.dong && <span>· {s.dong}</span>}
                        </p>
                      </button>
                    </li>
                  );
                })}
              </ul>
              {more > 0 && (
                <button
                  type="button"
                  onClick={() => setLimit((n) => n + 30)}
                  className="mt-2 min-h-[40px] w-full rounded-[var(--radius)] border border-[var(--border-strong)] text-[length:var(--text-xs)] font-bold transition hover:border-[var(--brand)] hover:text-[var(--brand)]"
                >
                  {more}곳 더 보기
                </button>
              )}
            </>
          )}

          <p className="mt-2 text-[length:var(--text-2xs)] text-[var(--text-faint)]">
            한국환경공단 실시간 충전기 상태 (3분 주기)
          </p>
        </>
      )}
    </Section>
  );
}
