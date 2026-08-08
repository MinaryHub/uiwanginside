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
  onFocus,
}: {
  onFocus: (lat: number, lng: number) => void;
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
        <span className="text-[10.5px] font-semibold text-[var(--muted)]">
          {POPULATION_AS_OF} 기준
        </span>
      }
    >
      {/* 시 전체 요약 */}
      <div className="mb-3 grid grid-cols-3 gap-1.5">
        <div className="rounded-lg bg-[var(--surface-2)] px-2 py-2 text-center">
          <div className="text-[15px] font-extrabold leading-tight tabular-nums">
            {fmt(TOTAL_POPULATION)}
          </div>
          <div className="mt-0.5 text-[10px] font-semibold text-[var(--muted)]">총인구</div>
        </div>
        <div className="rounded-lg bg-[var(--surface-2)] px-2 py-2 text-center">
          <div className="text-[15px] font-extrabold leading-tight tabular-nums">
            {fmt(HOUSEHOLDS.count)}
          </div>
          <div
            className="mt-0.5 text-[10px] font-semibold text-[var(--muted)]"
            title={`${HOUSEHOLDS.asOf} · ${HOUSEHOLDS.source}`}
          >
            세대 ({HOUSEHOLDS.asOf.replace("년 ", ".").replace("월", "")})
          </div>
        </div>
        <div className="rounded-lg bg-[var(--surface-2)] px-2 py-2 text-center">
          <div className="text-[15px] font-extrabold leading-tight tabular-nums">
            {fmt(density(TOTAL_POPULATION, CITY_AREA))}
          </div>
          <div className="mt-0.5 text-[10px] font-semibold text-[var(--muted)]">
            명/km²
          </div>
        </div>
      </div>

      {/* 정렬 */}
      <div className="mb-2 flex items-center gap-1">
        <span className="text-[10.5px] font-semibold text-[var(--muted)]">
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
              className="rounded px-1.5 py-0.5 text-[10.5px] font-bold transition"
              style={
                sort === k
                  ? { background: "var(--brand)", color: "#fff" }
                  : { color: "var(--muted)" }
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
                onClick={() => onFocus(d.lat, d.lng)}
                className="w-full rounded-lg px-2 py-1.5 text-left transition hover:bg-[var(--surface-2)]"
                title={`법정동: ${d.legalDongs.join(", ")}`}
              >
                <div className="flex items-baseline gap-1.5">
                  <span className="text-[12.5px] font-bold">{d.name}</span>
                  <span className="text-[10.5px] text-[var(--muted)]">
                    {d.area}km² · {fmt(density(d.population, d.area))}명/km²
                  </span>
                  <span className="ml-auto text-[12.5px] font-bold tabular-nums">
                    {fmt(d.population)}
                  </span>
                  <span className="w-9 text-right text-[10.5px] text-[var(--muted)] tabular-nums">
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

      <p className="mt-2.5 border-t border-[var(--border)] pt-2 text-[10px] leading-relaxed text-[var(--muted)]">
        동별 인구: 행정안전부 주민등록인구통계 {POPULATION_AS_OF} 기준 · 세대수:{" "}
        {HOUSEHOLDS.source} {HOUSEHOLDS.asOf} 기준 · 면적: 위키백과
      </p>
    </Card>
  );
}
