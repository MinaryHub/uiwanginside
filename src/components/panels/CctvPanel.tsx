"use client";

import { useMemo } from "react";
import { Skeleton, Empty, Notice } from "@/components/ui";
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
  onSelect,
}: {
  res?: ApiEnvelope<CctvPayload>;
  isLoading: boolean;
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
    <section className="border-t border-[var(--border)] px-4 py-3.5">
      <h2 className="text-[length:var(--text-sm)] font-bold">도로 CCTV</h2>
      <p className="mb-2 mt-0.5 text-[length:var(--text-2xs)] text-[var(--text-muted)]">
        의왕을 지나는 고속도로 · 누르면 지금 모습이 뜹니다
      </p>

      {isLoading && !res ? (
        <Skeleton rows={3} />
      ) : res?.ok === false ? (
        <Notice>{res.notice}</Notice>
      ) : byRoad.length === 0 ? (
        <Empty>표시할 카메라가 없습니다.</Empty>
      ) : (
        <div className="space-y-2.5">
          {byRoad.map(([road, cams]) => (
            <div key={road}>
              <p className="mb-1 text-[length:var(--text-2xs)] font-bold text-[var(--text-faint)]">
                {road}
              </p>
              <div className="flex flex-wrap gap-1">
                {cams.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => onSelect(c)}
                    className="min-h-[36px] rounded-[var(--radius)] border border-[var(--border)] px-2.5 text-[length:var(--text-xs)] font-semibold transition hover:border-[var(--brand)] hover:text-[var(--brand)]"
                  >
                    📹 {c.name}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
