"use client";

import { useMemo, useState } from "react";
import { Notice, Skeleton, Empty } from "@/components/ui";
import { CATEGORY_MAP, type CategoryKey } from "@/lib/uiwang";
import type { PlacesPayload, ApiEnvelope, Place, PlaceSource } from "@/lib/types";

const SOURCE_META: Record<PlaceSource, { label: string; color: string; title: string }> = {
  kakao: { label: "카카오", color: "#10b981", title: "카카오 로컬 API 실시간 데이터" },
  osm: {
    label: "OSM",
    color: "#3b82f6",
    title: "OpenStreetMap 실제 데이터 © OpenStreetMap contributors (ODbL)",
  },
  sample: { label: "샘플", color: "#9ca3af", title: "예시용 샘플 데이터" },
};

export default function PlacesPanel({
  res,
  isLoading,
  categories,
  radius,
  onRadiusChange,
  selectedPlaceId,
  onSelectPlace,
}: {
  res?: ApiEnvelope<PlacesPayload>;
  isLoading: boolean;
  /** 모드가 정한 카테고리 — 사용자가 개별 토글하지 않는다 */
  categories: CategoryKey[];
  radius: number;
  onRadiusChange: (r: number) => void;
  selectedPlaceId: string | null;
  onSelectPlace: (p: Place) => void;
}) {
  const [keyword, setKeyword] = useState("");
  /** 모드 안에서 한 종류만 보고 싶을 때 쓰는 좁히기 필터 */
  const [only, setOnly] = useState<CategoryKey | null>(null);

  const places = useMemo(() => res?.data.places ?? [], [res]);

  const countByCat = useMemo(() => {
    const m: Partial<Record<CategoryKey, number>> = {};
    for (const p of places) m[p.category] = (m[p.category] ?? 0) + 1;
    return m;
  }, [places]);

  const filtered = useMemo(() => {
    const k = keyword.trim();
    return places.filter((p) => {
      if (only && p.category !== only) return false;
      if (!k) return true;
      return p.name.includes(k) || p.roadAddress.includes(k) || p.address.includes(k);
    });
  }, [places, keyword, only]);

  const source = res?.data.source;

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-[var(--border)] p-2.5">
        {/* 모드 안에서 좁히기 — 전체가 기본 */}
        <div className="mb-2 flex flex-wrap gap-1">
          <button
            type="button"
            onClick={() => setOnly(null)}
            className="rounded-full px-2 py-1 text-[11.5px] font-bold transition"
            style={
              only === null
                ? { background: "var(--brand)", color: "#fff" }
                : { background: "var(--surface-2)", color: "var(--muted)" }
            }
          >
            전체 {places.length}
          </button>
          {categories.map((c) => {
            const def = CATEGORY_MAP[c];
            const on = only === c;
            return (
              <button
                key={c}
                type="button"
                onClick={() => setOnly(on ? null : c)}
                className="flex items-center gap-1 rounded-full px-2 py-1 text-[11.5px] font-bold transition"
                style={
                  on
                    ? { background: def.color, color: "#fff" }
                    : { background: "var(--surface-2)", color: "var(--muted)" }
                }
              >
                <span>{def.emoji}</span>
                {def.label}
                <span className="opacity-70">{countByCat[c] ?? 0}</span>
              </button>
            );
          })}
        </div>

        <input
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder="이름·주소로 찾기"
          className="mb-2 w-full rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-2.5 py-1.5 text-[12.5px] outline-none focus:border-[var(--brand)]"
        />

        <div className="flex items-center gap-2">
          <span className="shrink-0 text-[10.5px] font-semibold text-[var(--muted)]">
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
          <span className="w-11 shrink-0 text-right text-[11px] font-bold tabular-nums">
            {(radius / 1000).toFixed(1)}km
          </span>
        </div>
      </div>

      <div className="thin-scroll flex-1 overflow-y-auto p-2.5">
        {isLoading && !res ? (
          <Skeleton rows={6} />
        ) : (
          <>
            {res?.ok === false && <Notice>{res?.notice}</Notice>}

            <div className="mb-1.5 flex items-center">
              <p className="text-[10.5px] font-semibold text-[var(--muted)]">
                {filtered.length}곳 · 가까운 순
              </p>
              {source && (
                <span
                  title={SOURCE_META[source].title}
                  className="ml-auto text-[10px] font-bold"
                  style={{ color: SOURCE_META[source].color }}
                >
                  {SOURCE_META[source].label}
                </span>
              )}
            </div>

            {filtered.length === 0 ? (
              <Empty>표시할 곳이 없습니다. 반경을 넓혀 보세요.</Empty>
            ) : (
              <ul className="space-y-0.5">
                {filtered.slice(0, 150).map((p) => {
                  const def = CATEGORY_MAP[p.category];
                  const active = selectedPlaceId === p.id;
                  return (
                    <li key={p.id}>
                      <button
                        type="button"
                        onClick={() => onSelectPlace(p)}
                        className="w-full rounded-lg px-2 py-1.5 text-left transition hover:bg-[var(--surface-2)]"
                        style={
                          active
                            ? {
                                background: "var(--brand-soft)",
                                outline: `1px solid ${def.color}`,
                              }
                            : undefined
                        }
                      >
                        <div className="flex items-center gap-1.5">
                          <span className="shrink-0 text-[12px]">{def.emoji}</span>
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
                        {active && (
                          <div className="mt-1 pl-[18px]">
                            <p className="truncate text-[11px] text-[var(--muted)]">
                              {p.roadAddress || p.address}
                            </p>
                            <div className="mt-1 flex gap-1.5">
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
                                  상세 ↗
                                </a>
                              )}
                            </div>
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
