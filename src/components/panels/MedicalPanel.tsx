"use client";

import { useMemo, useState } from "react";
import { Section, Skeleton, Empty, LiveDot, Unavailable } from "@/components/ui";
import type { MedicalPayload, ApiEnvelope, MedicalPlace } from "@/lib/types";

type Filter = "open" | "hospital" | "pharmacy" | "all";

const FILTERS: [Filter, string][] = [
  ["open", "지금 진료중"],
  ["hospital", "병·의원"],
  ["pharmacy", "약국"],
  ["all", "전체"],
];

function Row({ p, onFocus }: { p: MedicalPlace; onFocus: (p: MedicalPlace) => void }) {
  const hours =
    p.todayStart && p.todayClose ? `${p.todayStart}~${p.todayClose}` : "시간 정보 없음";
  return (
    <li className="rounded-[var(--radius)] px-2 py-1.5 transition hover:bg-[var(--surface-2)]">
      <div className="flex items-center gap-1.5">
        <span className="shrink-0 text-[var(--text-xs)]">
          {p.kind === "hospital" ? "병원" : "약국"}
        </span>
        <button
          type="button"
          onClick={() => onFocus(p)}
          disabled={p.lat == null}
          className="min-w-0 flex-1 truncate text-left text-[var(--text-sm)] font-bold disabled:cursor-default"
        >
          {p.name}
        </button>
        {p.openNow === true && (
          <span className="shrink-0 rounded bg-[var(--ok-soft)] px-1 text-[var(--text-2xs)] font-bold text-[var(--ok)]">
            진료중
          </span>
        )}
        {p.openNow === false && (
          <span className="shrink-0 rounded bg-[var(--surface-2)] px-1 text-[var(--text-2xs)] font-bold text-[var(--text-muted)]">
            종료
          </span>
        )}
      </div>
      <div className="mt-0.5 flex items-center gap-1.5 pl-5">
        <span className="text-[var(--text-2xs)] text-[var(--text-muted)]">{hours}</span>
        {p.category && (
          <span className="truncate text-[var(--text-2xs)] text-[var(--text-muted)]">· {p.category}</span>
        )}
        {p.phone && (
          <a
            href={`tel:${p.phone}`}
            className="ml-auto shrink-0 rounded border border-[var(--border)] px-1.5 text-[var(--text-2xs)] font-semibold"
          >
            📞
          </a>
        )}
      </div>
    </li>
  );
}

export default function MedicalPanel({
  res,
  isLoading,
  onFocus,
}: {
  res?: ApiEnvelope<MedicalPayload>;
  isLoading: boolean;
  onFocus: (lat: number, lng: number) => void;
}) {
  const [filter, setFilter] = useState<Filter>("open");
  const d = res?.data;
  const places = useMemo(() => d?.places ?? [], [d]);

  const shown = useMemo(() => {
    const list =
      filter === "open"
        ? places.filter((p) => p.openNow === true)
        : filter === "all"
          ? places
          : places.filter((p) => p.kind === filter);
    // 진료중 우선, 그다음 이름순
    return [...list].sort((a, b) => {
      if (a.openNow !== b.openNow) return a.openNow ? -1 : 1;
      return a.name.localeCompare(b.name, "ko");
    });
  }, [places, filter]);

  const openCount = places.filter((p) => p.openNow === true).length;

  return (
    <Section
      title="진료중인 병원·약국"
      right={<LiveDot live={d?.source === "nmc"} />}
    >
      {isLoading && !d ? (
        <Skeleton rows={4} />
      ) : res?.ok === false ? (
        <Unavailable reason={res.notice} />
      ) : (
        <>
          <div className="mb-2 flex items-center gap-1.5">
            <span className="text-[var(--text-xs)] font-bold">
              지금 <span className="text-[var(--brand)]">{openCount}</span>곳 진료중
            </span>
            <span className="ml-auto flex gap-1">
              {FILTERS.map(([k, label]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setFilter(k)}
                  className="rounded px-1.5 py-0.5 text-[var(--text-2xs)] font-bold transition"
                  style={
                    filter === k
                      ? { background: "var(--brand-grad)", color: "var(--on-brand)" }
                      : { color: "var(--text-muted)" }
                  }
                >
                  {label}
                </button>
              ))}
            </span>
          </div>

          {shown.length === 0 ? (
            <Empty>
              {filter === "open"
                ? "지금 진료 중인 곳이 없습니다. '전체'로 확인해 보세요."
                : "표시할 항목이 없습니다."}
            </Empty>
          ) : (
            <ul className="thin-scroll max-h-[280px] space-y-0.5 overflow-y-auto">
              {shown.slice(0, 60).map((p) => (
                <Row
                  key={p.id}
                  p={p}
                  onFocus={(x) => x.lat != null && x.lng != null && onFocus(x.lat, x.lng)}
                />
              ))}
            </ul>
          )}

          <p className="mt-2 text-[var(--text-2xs)] leading-relaxed text-[var(--text-muted)]">
            국립중앙의료원 제공 진료시간 기준입니다. 실제 운영은 다를 수 있으니 방문 전
            전화로 확인하세요. 응급 상황은 <strong>119</strong>.
          </p>
        </>
      )}
    </Section>
  );
}
