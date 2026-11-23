"use client";

import { useMemo, useState } from "react";
import { Notice, Skeleton, Empty } from "@/components/ui";
import { formatDistance } from "@/lib/format";
import { CATEGORY_MAP, type CategoryKey } from "@/lib/uiwang";
import type { PlacesPayload, ApiEnvelope, Place, PlaceSource } from "@/lib/types";

const SOURCE_META: Record<PlaceSource, { label: string; color: string; title: string }> = {
  kakao: { label: "카카오", color: "var(--ok)", title: "카카오 로컬 API 실시간 데이터" },
  osm: {
    label: "OSM",
    color: "var(--info)",
    title: "OpenStreetMap 실제 데이터 © OpenStreetMap contributors (ODbL)",
  },
  public: {
    label: "공공",
    color: "var(--brand)",
    title: "공공데이터포털·지자체 공개 시설 데이터",
  },
};

export default function PlacesPanel({
  res,
  isLoading,
  isValidating,
  error,
  categories,
  onSearchHere,
  only,
  onOnlyChange,
  selectedPlaceId,
  onSelectPlace,
}: {
  res?: ApiEnvelope<PlacesPayload>;
  isLoading: boolean;
  isValidating?: boolean;
  error?: unknown;
  /** 모드가 정한 카테고리 — 사용자가 개별 토글하지 않는다 */
  categories: CategoryKey[];
  /** 지금 화면 범위로 다시 조회한다 */
  onSearchHere: () => void;
  /**
   * 좁히기 — 한 종류만 보고 싶을 때. Dashboard 가 들고 있다.
   * 목록만 좁히고 지도는 그대로 두면, 화장실만 보려 눌러도 지도에는
   * 297개가 그대로 남아 아무 소용이 없었다.
   */
  only: CategoryKey | null;
  onOnlyChange: (c: CategoryKey | null) => void;
  selectedPlaceId: string | null;
  onSelectPlace: (p: Place) => void;
}) {
  const [keyword, setKeyword] = useState("");
  /**
   * 처음에 보여줄 줄 수.
   *
   * 예전에는 150줄을 한꺼번에 그렸다. 생활 모드에 공원·화장실이 들어와
   * 297곳이 되자 목록이 6,600px 이 되어, 그 아래 있는 쓰레기·날씨·인구·
   * 뉴스 카드까지 폰에서 아홉 화면을 내려야 닿았다. 사실상 못 보는 것과
   * 같았다. 접어 두고 필요할 때 펼친다.
   */
  const [limit, setLimit] = useState(20);

  const places = useMemo(() => res?.data.places ?? [], [res]);

  const countByCat = useMemo(() => {
    const m: Partial<Record<CategoryKey, number>> = {};
    for (const p of places) m[p.category] = (m[p.category] ?? 0) + 1;
    return m;
  }, [places]);

  // 좁히기·검색을 바꾸면 다시 접는다 — 펼친 상태가 남으면 또 길어진다
  const narrowed = useMemo(() => {
    const k = keyword.trim().toLowerCase();
    return places.filter((p) => {
      if (only && p.category !== only) return false;
      if (!k) return true;
      return (
        p.name.toLowerCase().includes(k) ||
        p.roadAddress.toLowerCase().includes(k) ||
        p.address.toLowerCase().includes(k) ||
        p.categoryName.toLowerCase().includes(k)
      );
    });
  }, [places, keyword, only]);

  const filtered = narrowed;
  const shown = filtered.slice(0, limit);
  const more = filtered.length - shown.length;

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
            aria-pressed={only === null}
            onClick={() => {
              onOnlyChange(null);
              setLimit(20);
            }}
            className="press rounded-full px-3 py-1.5 text-[length:var(--text-xs)] font-bold"
            style={
              only === null
                ? {
                    background: "var(--brand-2)",
                    color: "var(--ink)",
                    border: "2px solid var(--ink)",
                    boxShadow: "var(--shadow-sm)",
                  }
                : {
                    background: "var(--surface)",
                    color: "var(--text)",
                    border: "2px solid var(--border)",
                  }
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
                aria-pressed={on}
                onClick={() => {
                  onOnlyChange(on ? null : c);
                  setLimit(20);
                }}
                className="press flex items-center gap-1 rounded-full px-3 py-1.5 text-[length:var(--text-xs)] font-bold"
                style={
                  on
                    ? {
                        background: "var(--brand-2)",
                        color: "var(--ink)",
                        border: "2px solid var(--ink)",
                        boxShadow: "var(--shadow-sm)",
                      }
                    : {
                        background: "var(--surface)",
                        color: "var(--text)",
                        border: "2px solid var(--border)",
                      }
                }
              >
                <span
                  aria-hidden
                  className="h-2 w-2 rounded-full"
                  style={{ background: def.color }}
                />
                {def.label}
                <span className="opacity-70">{countByCat[c] ?? 0}</span>
              </button>
            );
          })}
        </div>

        <input
          value={keyword}
          type="search"
          inputMode="search"
          enterKeyHint="search"
          aria-label="목록 안에서 이름이나 주소로 찾기"
          onChange={(e) => {
            setKeyword(e.target.value);
            setLimit(20);
          }}
          placeholder="이름·주소로 찾기"
          className="mb-2 min-h-[44px] w-full rounded-[var(--radius-full)] border border-transparent bg-[var(--surface-2)] px-4 text-[16px] outline-none transition focus:border-[var(--brand-2)] focus:bg-[var(--surface)] sm:text-[length:var(--text-sm)]"
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
          disabled={!!isValidating}
          className="press min-h-[42px] w-full rounded-[var(--radius-full)] border-2 border-[var(--ink)] text-[length:var(--text-xs)] font-bold shadow-[var(--shadow-sm)] hover:border-[var(--brand)] hover:text-[var(--brand)] disabled:opacity-60"
        >
          {isValidating ? "이 화면에서 찾는 중…" : "이 화면에서 다시 찾기"}
        </button>
      </div>

      <div className="px-4 py-3.5">
        {isLoading && !res ? (
          <Skeleton rows={6} />
        ) : (
          <>
            {error && !res && (
              <Notice tone="danger">장소 목록을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.</Notice>
            )}
            {res?.notice && <Notice>{res.notice}</Notice>}

            <div className="mb-1.5 flex items-center">
              <p className="text-[length:var(--text-2xs)] font-semibold text-[var(--text-muted)]">
                {filtered.length}곳 · 가까운 순
              </p>
              {/* 다 가져오지 못했으면 숨기지 않고 그대로 알린다 */}
              {truncated && (
                <span
                  title="카카오 로컬은 조회 한 번에 45곳까지만 줍니다. 화면을 격자로 나눠 여러 번 조회해 채우지만, 아주 촘촘한 곳은 전부 담기지 않습니다. 지도를 확대하면 남김없이 보입니다."
                  className="ml-1.5 text-[length:var(--text-2xs)] font-semibold text-[var(--text-faint)]"
                >
                  / 화면 안 {res?.data.total}곳
                </span>
              )}
              {source && SOURCE_META[source] && (
                <span
                  title={SOURCE_META[source].title}
                  className="ml-auto text-[length:var(--text-2xs)] font-bold"
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
                {shown.map((p) => {
                  const def = CATEGORY_MAP[p.category];
                  const active = selectedPlaceId === p.id;
                  const dist = formatDistance(p.distance);
                  const sub =
                    p.categoryName && p.categoryName.trim() !== def.label
                      ? p.categoryName.trim()
                      : null;
                  return (
                    <li
                      key={p.id}
                      className="rounded-[var(--radius)] transition hover:bg-[var(--surface-2)]"
                      style={active ? { background: "var(--surface-2)" } : undefined}
                    >
                      <button
                        type="button"
                        onClick={() => onSelectPlace(p)}
                        aria-expanded={active}
                        className="w-full rounded-[var(--radius)] px-2 py-2.5 text-left"
                      >
                        <div className="flex items-center gap-2.5">
                          <span
                            aria-hidden
                            className="h-1.5 w-1.5 shrink-0 rounded-full"
                            style={{ background: def.color }}
                          />
                          <span className="flex-1 truncate text-[length:var(--text-sm)] font-semibold">
                            {p.name}
                          </span>
                          {dist && (
                            <span className="shrink-0 tabular-nums text-[length:var(--text-2xs)] font-semibold text-[var(--text-muted)]">
                              {dist}
                            </span>
                          )}
                        </div>
                      </button>

                      {active && (
                        <div className="px-2 pb-2.5 pl-6">
                          {sub && (
                            <p className="mb-0.5 text-[length:var(--text-2xs)] font-semibold text-[var(--text)]">
                              {sub}
                            </p>
                          )}
                          {(p.roadAddress || p.address) && (
                            <p className="truncate text-[length:var(--text-xs)] text-[var(--text-muted)]">
                              {p.roadAddress || p.address}
                            </p>
                          )}
                          {(p.phone || p.url) && (
                            <div className="mt-1.5 flex flex-wrap gap-1.5">
                              {p.phone && (
                                <a
                                  href={`tel:${p.phone}`}
                                  className="inline-flex min-h-[34px] items-center rounded-full border border-[var(--border-strong)] px-2.5 py-1 text-[length:var(--text-2xs)] font-medium hover:bg-[var(--surface)]"
                                >
                                  {p.phone}
                                </a>
                              )}
                              {p.url && (
                                <a
                                  href={p.url}
                                  target="_blank"
                                  rel="noreferrer noopener"
                                  className="inline-flex min-h-[34px] items-center rounded-full border border-[var(--border-strong)] px-2.5 py-1 text-[length:var(--text-2xs)] font-medium hover:bg-[var(--surface)]"
                                >
                                  상세 ↗
                                </a>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}

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
      </div>
    </div>
  );
}
