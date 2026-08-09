"use client";

import { useMemo } from "react";
import { Card, Empty } from "@/components/ui";
import { Stars } from "@/components/StarRating";
import type { Place, PlaceRating } from "@/lib/types";

/**
 * 맛집 별점 순위.
 *
 * 별점 입력은 지도에서 가게를 누르면 뜨는 상세 카드에서 한다.
 * 같은 입력을 두 군데 두면 어느 쪽이 반영되는지 헷갈리므로 여기서는 뺐다.
 */
export default function RatingPanel({
  ratings,
  places,
  selectedId,
  onSelectPlace,
}: {
  ratings: Record<string, PlaceRating>;
  places: Place[];
  selectedId: string | null;
  onSelectPlace: (p: Place) => void;
}) {
  const ranked = useMemo(
    () =>
      places
        .map((p) => ({ p, r: ratings[p.id] }))
        .filter((x): x is { p: Place; r: PlaceRating } => !!x.r && x.r.count > 0)
        .sort((a, b) => b.r.avg - a.r.avg || b.r.count - a.r.count)
        .slice(0, 12),
    [places, ratings],
  );

  return (
    <Card title="별점 순위" icon="⭐">
      {ranked.length === 0 ? (
        <Empty>
          아직 평가된 가게가 없습니다.
          <br />
          지도에서 가게를 누르면 별점을 매길 수 있습니다.
        </Empty>
      ) : (
        <ol className="space-y-0.5">
          {ranked.map(({ p, r }, i) => {
            const on = selectedId === p.id;
            return (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => onSelectPlace(p)}
                  className="flex min-h-[44px] w-full items-center gap-2 rounded-[var(--radius)] px-2 text-left transition hover:bg-[var(--surface-2)]"
                  style={on ? { background: "var(--brand-soft)" } : undefined}
                >
                  <span className="tnum w-4 shrink-0 text-[var(--text-xs)] font-bold text-[var(--text-faint)]">
                    {i + 1}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[var(--text-sm)] font-semibold">
                    {p.name}
                  </span>
                  <Stars value={r.avg} size={12} />
                  <span className="tnum shrink-0 text-[var(--text-sm)] font-bold">
                    {r.avg.toFixed(1)}
                  </span>
                  <span className="tnum shrink-0 text-[var(--text-2xs)] text-[var(--text-muted)]">
                    ({r.count})
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      )}

      <p className="mt-3 border-t border-[var(--border)] pt-2.5 text-[var(--text-2xs)] leading-relaxed text-[var(--text-muted)]">
        평가는 의왕시 안에서 위치가 확인된 경우에만 가능하고, 한 기기당 가게별 1회입니다.
        가게 정보는 카카오 로컬 기준입니다.
      </p>
    </Card>
  );
}
