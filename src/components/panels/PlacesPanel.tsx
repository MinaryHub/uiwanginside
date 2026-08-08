"use client";

import { useMemo, useState } from "react";
import { Notice, Skeleton, Empty } from "@/components/ui";
import { CATEGORIES, CATEGORY_MAP, type CategoryKey } from "@/lib/uiwang";
import type { PlacesPayload, ApiEnvelope, Place, PlaceSource } from "@/lib/types";

const SOURCE_META: Record<PlaceSource, { label: string; color: string; title: string }> = {
  kakao: { label: "카카오 LIVE", color: "#10b981", title: "카카오 로컬 API 실시간 데이터" },
  osm: {
    label: "OSM",
    color: "#3b82f6",
    title: "OpenStreetMap 실제 데이터 © OpenStreetMap contributors (ODbL)",
  },
  sample: { label: "SAMPLE", color: "#9ca3af", title: "예시용 샘플 데이터" },
};

function SourceBadge({ source }: { source?: PlaceSource }) {
  if (!source) return null;
  const m = SOURCE_META[source];
  return (
    <span
      title={m.title}
      className="inline-flex items-center gap-1 text-[10px] font-bold"
      style={{ color: m.color }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: m.color }} />
      {m.label}
    </span>
  );
}

export default function PlacesPanel({
  res,
  isLoading,
  selected,
  onToggle,
  radius,
  onRadiusChange,
  selectedPlaceId,
  onSelectPlace,
}: {
  res?: ApiEnvelope<PlacesPayload>;
  isLoading: boolean;
  selected: CategoryKey[];
  onToggle: (c: CategoryKey) => void;
  radius: number;
  onRadiusChange: (r: number) => void;
  selectedPlaceId: string | null;
  onSelectPlace: (p: Place) => void;
}) {
  const [keyword, setKeyword] = useState("");
  const places = useMemo(() => res?.data.places ?? [], [res]);

  const filtered = useMemo(() => {
    const k = keyword.trim();
    if (!k) return places;
    return places.filter(
      (p) => p.name.includes(k) || p.roadAddress.includes(k) || p.address.includes(k),
    );
  }, [places, keyword]);

  const countByCat = useMemo(() => {
    const m: Partial<Record<CategoryKey, number>> = {};
    for (const p of places) m[p.category] = (m[p.category] ?? 0) + 1;
    return m;
  }, [places]);

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-[var(--border)] p-3">
        <div className="mb-2.5 flex flex-wrap gap-1.5">
          {CATEGORIES.map((c) => {
            const on = selected.includes(c.code);
            return (
              <button
                key={c.code}
                type="button"
                onClick={() => onToggle(c.code)}
                className="flex items-center gap-1 rounded-full border px-2 py-1 text-[11.5px] font-semibold transition"
                style={
                  on
                    ? { background: c.color, borderColor: c.color, color: "#fff" }
                    : { borderColor: "var(--border)", color: "var(--muted)" }
                }
              >
                <span>{c.emoji}</span>
                {c.label}
                {on && countByCat[c.code] != null && (
                  <span className="opacity-80">{countByCat[c.code]}</span>
                )}
              </button>
            );
          })}
        </div>

        <div className="mb-2 flex items-center gap-2">
          <span className="shrink-0 text-[11px] font-semibold text-[var(--muted)]">
            반경
          </span>
          <input
            type="range"
            min={500}
            max={10000}
            step={500}
            value={radius}
            onChange={(e) => onRadiusChange(Number(e.target.value))}
            className="h-1 flex-1 accent-[var(--brand)]"
          />
          <span className="w-12 shrink-0 text-right text-[11.5px] font-bold tabular-nums">
            {(radius / 1000).toFixed(1)}km
          </span>
        </div>

        <input
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder="목록에서 이름·주소 검색"
          className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-2.5 py-1.5 text-[12.5px] outline-none focus:border-[var(--brand)]"
        />
      </div>

      <div className="thin-scroll flex-1 overflow-y-auto p-3">
        {isLoading && !res ? (
          <Skeleton rows={6} />
        ) : (
          <>
            {/* OSM 폴백은 정상 동작이므로 경고가 아닌 출처 표기로 다룬다 */}
            {res?.ok === false && <Notice>{res?.notice}</Notice>}
            <div className="mb-2 flex items-center gap-1.5">
              <p className="text-[11px] font-semibold text-[var(--muted)]">
                {filtered.length}곳 · 가까운 순
              </p>
              <span className="ml-auto">
                <SourceBadge source={res?.data.source} />
              </span>
            </div>
            {filtered.length === 0 ? (
              <Empty>표시할 장소가 없습니다. 카테고리나 반경을 조정해 보세요.</Empty>
            ) : (
              <ul className="space-y-1">
                {filtered.slice(0, 200).map((p) => {
                  const def = CATEGORY_MAP[p.category];
                  const active = selectedPlaceId === p.id;
                  return (
                    <li key={p.id}>
                      <button
                        type="button"
                        onClick={() => onSelectPlace(p)}
                        className="w-full rounded-lg px-2.5 py-2 text-left transition"
                        style={{
                          background: active ? "var(--brand-soft)" : "transparent",
                          outline: active ? `1px solid ${def.color}` : "none",
                        }}
                      >
                        <div className="flex items-center gap-1.5">
                          <span className="shrink-0">{def.emoji}</span>
                          <span className="flex-1 truncate text-[12.5px] font-semibold">
                            {p.name}
                          </span>
                          {p.distance != null && (
                            <span className="shrink-0 text-[10.5px] font-semibold text-[var(--muted)]">
                              {p.distance >= 1000
                                ? `${(p.distance / 1000).toFixed(1)}km`
                                : `${p.distance}m`}
                            </span>
                          )}
                        </div>
                        <p className="mt-0.5 truncate pl-5 text-[11px] text-[var(--muted)]">
                          {p.roadAddress || p.address}
                        </p>
                        {active && (
                          <div className="mt-1.5 flex gap-1.5 pl-5">
                            {p.phone && (
                              <a
                                href={`tel:${p.phone}`}
                                onClick={(e) => e.stopPropagation()}
                                className="rounded border border-[var(--border)] px-1.5 py-0.5 text-[10.5px] font-semibold"
                              >
                                📞 {p.phone}
                              </a>
                            )}
                            {p.url && (
                              <a
                                href={p.url}
                                target="_blank"
                                rel="noreferrer noopener"
                                onClick={(e) => e.stopPropagation()}
                                className="rounded border border-[var(--border)] px-1.5 py-0.5 text-[10.5px] font-semibold"
                              >
                                상세보기 ↗
                              </a>
                            )}
                          </div>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        )}
      </div>
    </div>
  );
}
