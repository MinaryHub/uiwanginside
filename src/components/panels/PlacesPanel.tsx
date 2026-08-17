"use client";

import { useMemo, useState } from "react";
import { Notice, Skeleton, Empty } from "@/components/ui";
import { CATEGORY_MAP, type CategoryKey } from "@/lib/uiwang";
import type { PlacesPayload, ApiEnvelope, Place, PlaceSource } from "@/lib/types";

const SOURCE_META: Record<PlaceSource, { label: string; color: string; title: string }> = {
  kakao: { label: "카카오", color: "var(--ok)", title: "카카오 로컬 API 실시간 데이터" },
  osm: {
    label: "OSM",
    color: "var(--info)",
    title: "OpenStreetMap 실제 데이터 © OpenStreetMap contributors (ODbL)",
  },
};

export default function PlacesPanel({
  res,
  isLoading,
  categories,
  onSearchHere,
  selectedPlaceId,
  onSelectPlace,
}: {
  res?: ApiEnvelope<PlacesPayload>;
  isLoading: boolean;
  /** 모드가 정한 카테고리 — 사용자가 개별 토글하지 않는다 */
  categories: CategoryKey[];
  /** 지금 화면 범위로 다시 조회한다 */
  onSearchHere: () => void;
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
  const total = res?.data.total ?? 0;
  const truncated = total > places.length;

  return (
    <div>
      <div className="border-b border-[var(--border)] px-4 py-3.5">
        {/* 모드 안에서 좁히기 — 전체가 기본 */}
        <div className="mb-2 flex flex-wrap gap-1">
          <button
            type="button"
            onClick={() => setOnly(null)}
            className="rounded-full px-2 py-1 text-[var(--text-xs)] font-bold transition"
            style={
              only === null
                ? { background: "var(--brand)", color: "#fff" }
                : { background: "var(--surface-2)", color: "var(--text-muted)" }
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
                className="flex items-center gap-1 rounded-full px-2 py-1 text-[var(--text-xs)] font-bold transition"
                style={
                  on
                    ? { background: def.color, color: "#fff" }
                    : { background: "var(--surface-2)", color: "var(--text-muted)" }
                }
              >
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
          className="mb-2 w-full rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface-2)] px-2.5 py-1.5 text-[var(--text-sm)] outline-none focus:border-[var(--brand)]"
        />

        {/*
          여기 반경 슬라이더가 있었다. 조회는 화면 범위(rect)로 하는데
          radius 는 요청에 들어가지도 않아, 끌어도 결과가 그대로였다.
          조절했다고 믿게 만드는 눈금이라 없앴다.

          대신 지금 화면에서 다시 찾는 버튼을 둔다. 지도를 조금 옮겼을
          때는 자동으로 갱신하지 않는데(마커가 계속 바뀌면 눈이 따라가지
          못한다), 그럴 때 직접 누를 수 있어야 한다.
        */}
        <button
          type="button"
          onClick={onSearchHere}
          className="min-h-[40px] w-full rounded-[var(--radius)] border border-[var(--border-strong)] text-[var(--text-xs)] font-bold transition hover:border-[var(--brand)] hover:text-[var(--brand)]"
        >
          이 화면에서 다시 찾기
        </button>
      </div>

      <div className="px-4 py-3.5">
        {isLoading && !res ? (
          <Skeleton rows={6} />
        ) : (
          <>
            {res?.ok === false && <Notice>{res?.notice}</Notice>}

            <div className="mb-1.5 flex items-center">
              <p className="text-[var(--text-2xs)] font-semibold text-[var(--text-muted)]">
                {filtered.length}곳 · 가까운 순
              </p>
              {/* 다 가져오지 못했으면 숨기지 않고 그대로 알린다 */}
              {truncated && (
                <span
                  title="카카오 로컬은 조회 한 번에 45곳까지만 줍니다. 화면을 격자로 나눠 여러 번 조회해 채우지만, 아주 촘촘한 곳은 전부 담기지 않습니다. 지도를 확대하면 남김없이 보입니다."
                  className="ml-1.5 text-[var(--text-2xs)] font-semibold text-[var(--text-faint)]"
                >
                  / 화면 안 {res?.data.total}곳
                </span>
              )}
              {source && (
                <span
                  title={SOURCE_META[source].title}
                  className="ml-auto text-[var(--text-2xs)] font-bold"
                  style={{ color: SOURCE_META[source].color }}
                >
                  {SOURCE_META[source].label}
                </span>
              )}
            </div>

            {filtered.length === 0 ? (
              <Empty>표시할 곳이 없습니다. 지도를 옮기거나 넓혀 보세요.</Empty>
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
                        className="w-full rounded-[var(--radius)] px-2 py-2 text-left transition hover:bg-[var(--surface-2)]"
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
                          <span
                            aria-hidden
                            className="h-1.5 w-1.5 shrink-0 rounded-full"
                            style={{ background: def.color }}
                          />
                          <span className="flex-1 truncate text-[var(--text-sm)] font-semibold">
                            {p.name}
                          </span>
                          {p.distance != null && (
                            <span className="shrink-0 text-[var(--text-2xs)] font-semibold text-[var(--text-muted)]">
                              {p.distance >= 1000
                                ? `${(p.distance / 1000).toFixed(1)}km`
                                : `${p.distance}m`}
                            </span>
                          )}
                        </div>
                        {active && (
                          <div className="mt-1 pl-[18px]">
                            <p className="truncate text-[var(--text-xs)] text-[var(--text-muted)]">
                              {p.roadAddress || p.address}
                            </p>
                            <div className="mt-1 flex gap-1.5">
                              {p.phone && (
                                <a
                                  href={`tel:${p.phone}`}
                                  onClick={(e) => e.stopPropagation()}
                                  className="rounded border border-[var(--border)] px-1.5 py-0.5 text-[var(--text-2xs)] font-semibold"
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
                                  className="rounded border border-[var(--border)] px-1.5 py-0.5 text-[var(--text-2xs)] font-semibold"
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
