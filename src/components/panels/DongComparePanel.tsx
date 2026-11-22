"use client";

import { useMemo, useState } from "react";
import { Section } from "@/components/ui";
import { dongFor } from "@/lib/geo";
import { DONG_POPULATION } from "@/lib/population";
import {
  UIWANG_PARKS,
  UIWANG_PARKING,
  UIWANG_TOILETS,
  UIWANG_SECURITY_CAMS,
} from "@/lib/uiwang-facilities";
import { FACTORY_SUMMARY, summarizeFactories } from "@/lib/factories";
import type {
  ApiEnvelope,
  EvChargersPayload,
  FactoriesPayload,
  MedicalPayload,
} from "@/lib/types";

type MetricKey = "parks" | "parking" | "toilets" | "cctv" | "medical" | "factories" | "ev";

interface MetricDef {
  key: MetricKey;
  label: string;
  emoji: string;
  unit: string;
  color: string;
}

const METRICS: MetricDef[] = [
  { key: "parks", label: "공원", emoji: "🌳", unit: "곳", color: "#2b8a3e" },
  { key: "parking", label: "주차장", emoji: "🅿️", unit: "곳", color: "#364fc7" },
  { key: "toilets", label: "화장실", emoji: "🚻", unit: "곳", color: "#0b7285" },
  { key: "cctv", label: "방범CCTV", emoji: "🎥", unit: "곳", color: "#7048e8" },
  { key: "medical", label: "병·약국", emoji: "🏥", unit: "곳", color: "#d92626" },
  { key: "factories", label: "공장", emoji: "🏭", unit: "곳", color: "#c84600" },
  { key: "ev", label: "충전소", emoji: "⚡", unit: "곳", color: "#1864ab" },
];

/** 정적 공공시설을 행정동 경계 폴리곤으로 1회 집계한다 */
function countStaticByDong() {
  const parks: Record<string, number> = {};
  const parking: Record<string, number> = {};
  const toilets: Record<string, number> = {};
  const cctv: Record<string, number> = {};

  for (const p of UIWANG_PARKS) {
    const d = dongFor(p.lat, p.lng);
    if (d) parks[d] = (parks[d] ?? 0) + 1;
  }
  for (const p of UIWANG_PARKING) {
    const d = dongFor(p.lat, p.lng);
    if (d) parking[d] = (parking[d] ?? 0) + 1;
  }
  for (const t of UIWANG_TOILETS) {
    const d = dongFor(t.lat, t.lng);
    if (d) toilets[d] = (toilets[d] ?? 0) + 1;
  }
  for (const c of UIWANG_SECURITY_CAMS) {
    const d = dongFor(c.lat, c.lng);
    if (d) cctv[d] = (cctv[d] ?? 0) + 1;
  }
  return { parks, parking, toilets, cctv };
}

const STATIC_COUNTS = countStaticByDong();

export default function DongComparePanel({
  medical,
  factories,
  evChargers,
  activeDong,
  onSelectDong,
}: {
  medical?: ApiEnvelope<MedicalPayload>;
  factories?: ApiEnvelope<FactoriesPayload>;
  evChargers?: ApiEnvelope<EvChargersPayload>;
  activeDong: string | null;
  onSelectDong: (d: { name: string }) => void;
}) {
  const [metric, setMetric] = useState<MetricKey>("parks");
  const [perCapita, setPerCapita] = useState(false);

  const dynamicCounts = useMemo(() => {
    const med: Record<string, number> = {};
    for (const p of medical?.data.places ?? []) {
      if (p.lat == null || p.lng == null) continue;
      const d = dongFor(p.lat, p.lng);
      if (d) med[d] = (med[d] ?? 0) + 1;
    }

    const facSummary =
      factories?.ok && factories.data.factories.length > 0
        ? summarizeFactories(factories.data.factories, factories.data.asOf)
        : FACTORY_SUMMARY;
    const fac: Record<string, number> = {};
    for (const t of facSummary.byDong) fac[t.key] = t.count;

    const ev: Record<string, number> = {};
    for (const st of evChargers?.data.stations ?? []) {
      const d = st.dong || dongFor(st.lat, st.lng);
      if (d) ev[d] = (ev[d] ?? 0) + 1;
    }

    return { medical: med, factories: fac, ev };
  }, [medical, factories, evChargers]);

  const availableMetrics = useMemo(() => {
    const hasMed = Object.values(dynamicCounts.medical).some((v) => v > 0);
    const hasFac = Object.values(dynamicCounts.factories).some((v) => v > 0);
    const hasEv = Object.values(dynamicCounts.ev).some((v) => v > 0);
    return METRICS.filter((m) => {
      if (m.key === "medical") return hasMed;
      if (m.key === "factories") return hasFac;
      if (m.key === "ev") return hasEv;
      return true;
    });
  }, [dynamicCounts]);

  const activeMetric =
    availableMetrics.find((m) => m.key === metric) ?? availableMetrics[0];

  const rows = useMemo(() => {
    const table: Record<MetricKey, Record<string, number>> = {
      ...STATIC_COUNTS,
      ...dynamicCounts,
    };
    const counts = table[activeMetric.key];
    return DONG_POPULATION.map((d) => {
      const raw = counts[d.name] ?? 0;
      const rate = (raw / d.population) * 10_000;
      return {
        name: d.name,
        population: d.population,
        raw,
        rate,
        value: perCapita ? rate : raw,
      };
    }).sort((a, b) => b.value - a.value || a.name.localeCompare(b.name, "ko"));
  }, [activeMetric.key, dynamicCounts, perCapita]);

  const max = Math.max(0.1, ...rows.map((r) => r.value));
  const totalRaw = rows.reduce((sum, r) => sum + r.raw, 0);

  return (
    <Section
      title="동별 생활 인프라 비교"
      right={
        <button
          type="button"
          aria-pressed={perCapita}
          onClick={() => setPerCapita((v) => !v)}
          className={`min-h-[32px] rounded-full border-2 px-2.5 text-[length:var(--text-2xs)] font-bold transition ${
            perCapita
              ? "border-[var(--ink)] shadow-[var(--shadow-sm)]"
              : "border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--surface-2)]"
          }`}
          style={perCapita ? { background: "var(--brand-2)", color: "var(--ink)" } : undefined}
        >
          {perCapita ? "1만명당 보기" : "전체 개수"}
        </button>
      }
    >
      <div className="mb-3 flex flex-wrap gap-1">
        {availableMetrics.map((m) => {
          const on = activeMetric.key === m.key;
          return (
            <button
              key={m.key}
              type="button"
              aria-pressed={on}
              onClick={() => setMetric(m.key)}
              className={`min-h-[34px] rounded-full border-2 px-2.5 text-[length:var(--text-2xs)] font-bold transition ${
                on
                  ? "border-[var(--ink)] shadow-[var(--shadow-sm)]"
                  : "border-transparent bg-[var(--surface-2)] text-[var(--text-muted)] hover:brightness-95"
              }`}
              style={on ? { background: "var(--brand-2)", color: "var(--ink)" } : undefined}
            >
              <span aria-hidden>{m.emoji} </span>
              {m.label}
            </button>
          );
        })}
      </div>

      <p className="mb-2 text-[length:var(--text-xs)] text-[var(--text-muted)]">
        의왕시 전체 {activeMetric.label}{" "}
        <b className="tnum text-[var(--text)]">
          {totalRaw.toLocaleString("ko-KR")}
          {activeMetric.unit}
        </b>
        {perCapita && " · 인구 1만 명당 밀도 비교"}
      </p>

      <ul className="space-y-1.5">
        {rows.map((r) => {
          const on = activeDong === r.name;
          return (
            <li key={r.name}>
              <button
                type="button"
                aria-pressed={on}
                onClick={() => onSelectDong({ name: r.name })}
                className={`flex min-h-[40px] w-full items-center gap-2 rounded-[var(--radius)] border-2 px-2 py-1.5 text-left transition ${
                  on
                    ? "border-[var(--info)] bg-[var(--surface-2)]"
                    : "border-transparent hover:bg-[var(--surface-2)]"
                }`}
              >
                <span className="w-16 shrink-0 text-[length:var(--text-sm)] font-bold">
                  {r.name}
                </span>
                <span className="relative h-3.5 min-w-0 flex-1 overflow-hidden rounded-full border-2 border-[var(--ink)] bg-[var(--surface-2)]">
                  <span
                    className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-300"
                    style={{
                      width: `${Math.max(r.value > 0 ? 6 : 0, (r.value / max) * 100)}%`,
                      background: activeMetric.color,
                    }}
                  />
                </span>
                <span className="tnum w-16 shrink-0 text-right text-[length:var(--text-xs)] font-extrabold">
                  {perCapita
                    ? `${r.rate.toFixed(1)}`
                    : `${r.raw.toLocaleString("ko-KR")}${activeMetric.unit}`}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      <p className="mt-2.5 text-[length:var(--text-2xs)] leading-relaxed text-[var(--text-faint)]">
        각 시설 좌표를 행정동 경계에 대조해 집계했습니다. 동을 누르면 지도에서 경계가 표시됩니다.
      </p>
    </Section>
  );
}
