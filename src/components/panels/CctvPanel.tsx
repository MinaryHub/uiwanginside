"use client";

import { useMemo } from "react";
import { Section, Skeleton, Empty, Unavailable } from "@/components/ui";
import type { ApiEnvelope } from "@/lib/types";
import type { Cctv, CctvPayload } from "@/lib/cctvTypes";

/**
 * 도로 CCTV 목록.
 *
 * 열다섯 대가 모두 고속도로 위에 있어 지도에서는 시 가장자리에 흩어진다.
 * 지도를 한참 끌어야 찾을 수 있으니 노선별로 묶어 목록으로도 둔다.
 */
export default function CctvPanel({
  res,
  isLoading,
  error,
  activeCctvId,
  onSelect,
}: {
  res?: ApiEnvelope<CctvPayload>;
  isLoading: boolean;
  error?: unknown;
  activeCctvId?: string | null;
  onSelect: (c: Cctv) => void;
}) {
  const byRoad = useMemo(() => {
    const m = new Map<string, Cctv[]>();
    for (const c of res?.data.cameras ?? []) {
      const k = c.road || "기타";
      const list = m.get(k);
      if (list) list.push(c);
      else m.set(k, [c]);
    }
    return [...m.entries()];
  }, [res]);

  return (
    <Section title="도로 CCTV">
      <p className="mb-2.5 -mt-1.5 text-[length:var(--text-2xs)] text-[var(--text-muted)]">
        의왕을 지나는 고속도로 · 누르면 지금 모습이 뜹니다
      </p>

      {isLoading && !res ? (
        <Skeleton rows={3} />
      ) : !res?.ok ? (
        <Unavailable reason={res?.notice} error={error} />
      ) : byRoad.length === 0 ? (
        <Empty>표시할 카메라가 없습니다.</Empty>
      ) : (
        <div className="space-y-3">
          {byRoad.map(([road, cams]) => (
            <div key={road}>
              <p className="mb-1 text-[length:var(--text-2xs)] font-bold text-[var(--text-faint)]">
                {road}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {cams.map((c) => {
                  const on = activeCctvId === c.id;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      aria-pressed={on}
                      onClick={() => onSelect(c)}
                      className={`min-h-[44px] rounded-[var(--radius)] border-2 px-3 text-[length:var(--text-xs)] font-semibold transition ${
                        on
                          ? "border-[var(--ink)] shadow-[var(--shadow-sm)]"
                          : "border-[var(--border)] hover:border-[var(--brand)] hover:text-[var(--brand)]"
                      }`}
                      style={on ? { background: "var(--brand-2)", color: "var(--ink)" } : undefined}
                    >
                      <span aria-hidden>📹 </span>
                      {c.name}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </Section>
  );
}
