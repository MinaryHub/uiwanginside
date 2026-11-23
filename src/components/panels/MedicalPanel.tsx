"use client";

import { useMemo, useState } from "react";
import { Section, Skeleton, Empty, LiveDot, Notice, Unavailable } from "@/components/ui";
import type { MedicalPayload, ApiEnvelope, MedicalPlace } from "@/lib/types";

type Filter = "open" | "hospital" | "pharmacy" | "all";

const FILTERS: [Filter, string][] = [
  ["open", "지금 진료중"],
  ["hospital", "병·의원"],
  ["pharmacy", "약국"],
  ["all", "전체"],
];

function openRank(v: boolean | null): number {
  return v === true ? 0 : v === false ? 1 : 2;
}

function Row({ p, onSelect }: { p: MedicalPlace; onSelect: (p: MedicalPlace) => void }) {
  const hours =
    p.todayStart && p.todayClose ? `${p.todayStart}~${p.todayClose}` : "시간 정보 없음";
  return (
    <li className="rounded-[var(--radius)] px-2 py-2 transition hover:bg-[var(--surface-2)]">
      <div className="flex items-center gap-1.5">
        <span className="shrink-0 text-[length:var(--text-xs)] text-[var(--text-muted)]">
          {p.kind === "hospital" ? "병원" : "약국"}
        </span>
        <button
          type="button"
          onClick={() => onSelect(p)}
          disabled={p.lat == null || p.lng == null}
          className="min-w-0 flex-1 truncate text-left text-[length:var(--text-sm)] font-bold disabled:cursor-default"
        >
          {p.name}
        </button>
        {p.openNow === true && (
          <span className="shrink-0 rounded bg-[var(--ok-soft)] px-1.5 py-0.5 text-[length:var(--text-2xs)] font-bold text-[var(--ok)]">
            진료중
          </span>
        )}
        {p.openNow === false && (
          <span className="shrink-0 rounded bg-[var(--surface-2)] px-1.5 py-0.5 text-[length:var(--text-2xs)] font-bold text-[var(--text-muted)]">
            종료
          </span>
        )}
      </div>
      <div className="mt-1 flex items-center gap-1.5 pl-8">
        <span className="tabular-nums text-[length:var(--text-2xs)] text-[var(--text-muted)]">
          {hours}
        </span>
        {p.category && (
          <span className="truncate text-[length:var(--text-2xs)] text-[var(--text-muted)]">
            · {p.category}
          </span>
        )}
        {p.phone && (
          <a
            href={`tel:${p.phone}`}
            aria-label={`${p.name} 전화 걸기 (${p.phone})`}
            title={p.phone}
            className="ml-auto inline-flex min-h-[36px] min-w-[36px] shrink-0 items-center justify-center rounded-[var(--radius)] border border-[var(--border)] px-2 text-[length:var(--text-2xs)] font-semibold hover:bg-[var(--surface-2)]"
          >
            <span aria-hidden>📞</span>
          </a>
        )}
      </div>
    </li>
  );
}

export default function MedicalPanel({
  res,
  isLoading,
  error,
  onSelect,
}: {
  res?: ApiEnvelope<MedicalPayload>;
  isLoading: boolean;
  error?: unknown;
  onSelect: (p: MedicalPlace) => void;
}) {
  const [filter, setFilter] = useState<Filter>("open");
  const [keyword, setKeyword] = useState("");
  const [limit, setLimit] = useState(40);
  const d = res?.data;
  const places = useMemo(() => d?.places ?? [], [d]);

  const shown = useMemo(() => {
    const q = keyword.trim().toLowerCase();
    const list = places.filter((p) => {
      if (filter === "open" && p.openNow !== true) return false;
      if ((filter === "hospital" || filter === "pharmacy") && p.kind !== filter) return false;
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q) ||
        p.address.toLowerCase().includes(q)
      );
    });
    // 진료중(0) → 종료(1) → 정보없음(2), 그다음 이름순
    return [...list].sort((a, b) => {
      const diff = openRank(a.openNow) - openRank(b.openNow);
      if (diff !== 0) return diff;
      return a.name.localeCompare(b.name, "ko");
    });
  }, [places, filter, keyword]);

  const openCount = useMemo(() => places.filter((p) => p.openNow === true).length, [places]);
  const visible = shown.slice(0, limit);
  const more = shown.length - visible.length;

  return (
    <Section
      title="진료중인 병원·약국"
      right={<LiveDot live={d?.source === "nmc" && !!res?.ok} />}
    >
      {isLoading && !d ? (
        <Skeleton rows={4} />
      ) : !res?.ok ? (
        <Unavailable reason={res?.notice} error={error} />
      ) : (
        <>
          {res.notice && <Notice>{res.notice}</Notice>}

          <div className="mb-2 flex flex-wrap items-center gap-1.5">
            <span className="text-[length:var(--text-xs)] font-bold">
              지금 <span className="text-[var(--brand)]">{openCount}</span>곳 진료중
            </span>
            <div className="ml-auto flex flex-wrap gap-1">
              {FILTERS.map(([k, label]) => {
                const on = filter === k;
                return (
                  <button
                    key={k}
                    type="button"
                    aria-pressed={on}
                    onClick={() => {
                      setFilter(k);
                      setLimit(40);
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
            type="search"
            inputMode="search"
            enterKeyHint="search"
            aria-label="병원·약국 이름 또는 진료과목 검색"
            onChange={(e) => {
              setKeyword(e.target.value);
              setLimit(40);
            }}
            placeholder="병원·약국 이름, 진료과목으로 찾기"
            className="mb-2 min-h-[44px] w-full rounded-[var(--radius-full)] border border-transparent bg-[var(--surface-2)] px-3.5 text-[16px] outline-none transition focus:border-[var(--brand-2)] focus:bg-[var(--surface)] sm:text-[length:var(--text-xs)]"
          />

          {visible.length === 0 ? (
            <Empty>
              {filter === "open" && !keyword.trim()
                ? "지금 진료 중인 곳이 없습니다. '전체'로 확인해 보세요."
                : "표시할 항목이 없습니다."}
            </Empty>
          ) : (
            <>
              <ul className="thin-scroll max-h-[300px] space-y-0.5 overflow-y-auto">
                {visible.map((p) => (
                  <Row key={p.id} p={p} onSelect={onSelect} />
                ))}
              </ul>
              {more > 0 && (
                <button
                  type="button"
                  onClick={() => setLimit((n) => n + 40)}
                  className="mt-2 min-h-[40px] w-full rounded-[var(--radius)] border border-[var(--border-strong)] text-[length:var(--text-xs)] font-bold transition hover:border-[var(--brand)] hover:text-[var(--brand)]"
                >
                  {more}곳 더 보기
                </button>
              )}
            </>
          )}

          <p className="mt-2 text-[length:var(--text-2xs)] leading-relaxed text-[var(--text-muted)]">
            국립중앙의료원 제공 진료시간 기준입니다. 실제 운영은 다를 수 있으니 방문 전
            전화로 확인하세요. 응급 상황은 <strong>119</strong>.
          </p>
        </>
      )}
    </Section>
  );
}
