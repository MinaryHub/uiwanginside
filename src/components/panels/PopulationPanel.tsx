"use client";

import { useState } from "react";
import { Card } from "@/components/ui";
import {
  DONG_POPULATION,
  TOTAL_POPULATION,
  POPULATION_AS_OF,
  HOUSEHOLDS,
  CITY_AREA,
  density,
} from "@/lib/population";

type SortKey = "population" | "density" | "name";

const fmt = (n: number) => n.toLocaleString("ko-KR");

export default function PopulationPanel({
  onSelectDong,
  activeDong,
}: {
  /** 누르면 지도에서 해당 동 경계를 강조한다 */
  onSelectDong: (d: { name: string; lat: number; lng: number }) => void;
  activeDong: string | null;
}) {
  const [sort, setSort] = useState<SortKey>("population");

  const rows = [...DONG_POPULATION].sort((a, b) => {
    if (sort === "name") return a.name.localeCompare(b.name, "ko");
    if (sort === "density")
      return density(b.population, b.area) - density(a.population, a.area);
    return b.population - a.population;
  });

  const max = Math.max(...rows.map((d) => d.population));

  return (
    <Card
      title="인구"
      icon="👥"
      right={
        <span className="text-[var(--text-2xs)] font-semibold text-[var(--text-muted)]">
          {POPULATION_AS_OF} 기준
        </span>
      }
    >
      {/* 시 전체 요약 */}
      <div className="mb-3 grid grid-cols-3 gap-1.5">
        <div className="rounded-[var(--radius)] bg-[var(--surface-2)] px-2 py-2 text-center">
          <div className="text-[var(--text-base)] font-extrabold leading-tight tabular-nums">
            {fmt(TOTAL_POPULATION)}
          </div>
          <div className="mt-0.5 text-[var(--text-2xs)] font-semibold text-[var(--text-muted)]">총인구</div>
        </div>
        <div className="rounded-[var(--radius)] bg-[var(--surface-2)] px-2 py-2 text-center">
          <div className="text-[var(--text-base)] font-extrabold leading-tight tabular-nums">
            {fmt(HOUSEHOLDS.count)}
          </div>
          <div
            className="mt-0.5 text-[var(--text-2xs)] font-semibold text-[var(--text-muted)]"
            title={`${HOUSEHOLDS.asOf} · ${HOUSEHOLDS.source}`}
          >
            세대 ({HOUSEHOLDS.asOf.replace("년 ", ".").replace("월", "")})
          </div>
        </div>
        <div className="rounded-[var(--radius)] bg-[var(--surface-2)] px-2 py-2 text-center">
          <div className="text-[var(--text-base)] font-extrabold leading-tight tabular-nums">
            {fmt(density(TOTAL_POPULATION, CITY_AREA))}
          </div>
          <div className="mt-0.5 text-[var(--text-2xs)] font-semibold text-[var(--text-muted)]">
            명/km²
          </div>
        </div>
      </div>

      {/* 정렬 */}
      <div className="mb-2 flex items-center gap-1">
        <span className="text-[var(--text-2xs)] font-semibold text-[var(--text-muted)]">
          {rows.length}개 행정동
        </span>
        <div className="ml-auto flex gap-1">
          {(
            [
              ["population", "인구순"],
              ["density", "밀도순"],
              ["name", "가나다"],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              type="button"
              onClick={() => setSort(k)}
              className="rounded px-1.5 py-0.5 text-[var(--text-2xs)] font-bold transition"
              style={
                sort === k
                  ? { background: "var(--brand)", color: "#fff" }
                  : { color: "var(--text-muted)" }
              }
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* 동별 */}
      <ul className="space-y-1.5">
        {rows.map((d) => {
          const share = (d.population / TOTAL_POPULATION) * 100;
          return (
            <li key={d.name}>
              <button
                type="button"
                onClick={() => onSelectDong(d)}
                aria-pressed={activeDong === d.name}
                className="w-full rounded-[var(--radius)] px-2 py-1.5 text-left transition hover:bg-[var(--surface-2)]"
                style={
                  activeDong === d.name
                    ? { background: "color-mix(in srgb, var(--info) 12%, transparent)", outline: "1px solid var(--info)" }
                    : undefined
                }
                title={`${d.name} 경계 보기 · 법정동: ${d.legalDongs.join(", ")}`}
              >
                <div className="flex items-baseline gap-1.5">
                  <span className="text-[var(--text-sm)] font-bold">{d.name}</span>
                  <span className="text-[var(--text-2xs)] text-[var(--text-muted)]">
                    {d.area}km² · {fmt(density(d.population, d.area))}명/km²
                  </span>
                  <span className="ml-auto text-[var(--text-sm)] font-bold tabular-nums">
                    {fmt(d.population)}
                  </span>
                  <span className="w-9 text-right text-[var(--text-2xs)] text-[var(--text-muted)] tabular-nums">
                    {share.toFixed(1)}%
                  </span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[var(--surface-2)]">
                  <div
                    className="h-full rounded-full transition-[width] duration-500"
                    style={{
                      width: `${(d.population / max) * 100}%`,
                      background: "var(--brand)",
                    }}
                  />
                </div>
              </button>
            </li>
          );
        })}
      </ul>

      <p className="mt-2.5 border-t border-[var(--border)] pt-2 text-[var(--text-2xs)] leading-relaxed text-[var(--text-muted)]">
        동별 인구: 행정안전부 주민등록인구통계 {POPULATION_AS_OF} 기준 · 세대수:{" "}
        {HOUSEHOLDS.source} {HOUSEHOLDS.asOf} 기준 · 면적: 위키백과
      </p>
    </Card>
  );
}
