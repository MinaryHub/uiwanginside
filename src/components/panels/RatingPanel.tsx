"use client";

import { useCallback, useMemo, useState } from "react";
import { Card, Empty } from "@/components/ui";
import { Stars, StarInput } from "@/components/StarRating";
import { useMyLocation } from "@/lib/useMyLocation";
import { getDeviceId } from "@/lib/deviceId";
import type { Place, PlaceRating } from "@/lib/types";

export default function RatingPanel({
  selected,
  ratings,
  places,
  onRated,
  onSelectPlace,
}: {
  /** 지도/목록에서 선택된 가게. 없으면 안내만 띄운다 */
  selected: Place | null;
  ratings: Record<string, PlaceRating>;
  places: Place[];
  onRated: () => void;
  onSelectPlace: (p: Place) => void;
}) {
  const { state, request } = useMyLocation();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [comment, setComment] = useState("");

  const canRate = state.status === "ok" && state.inUiwang;
  const mine = selected ? (ratings[selected.id]?.mine ?? null) : null;

  const submit = useCallback(
    async (stars: number) => {
      if (!selected || state.status !== "ok") return;
      setBusy(true);
      setMessage(null);
      try {
        const res = await fetch("/api/ratings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            placeId: selected.id,
            placeName: selected.name,
            stars,
            comment: comment.trim() || undefined,
            deviceId: getDeviceId(),
            lat: state.lat,
            lng: state.lng,
            accuracy: state.accuracy,
          }),
        });
        const json = (await res.json()) as { ok?: boolean; message?: string };
        if (!res.ok || !json.ok) {
          setMessage(json.message ?? "평가를 저장하지 못했습니다.");
        } else {
          setMessage(mine ? "평가를 수정했습니다." : "평가를 등록했습니다. 감사합니다!");
          setComment("");
          onRated();
        }
      } catch {
        setMessage("네트워크 오류로 저장하지 못했습니다.");
      } finally {
        setBusy(false);
      }
    },
    [selected, state, comment, mine, onRated],
  );

  /** 별점이 있는 가게를 평균 높은 순으로 */
  const ranked = useMemo(
    () =>
      places
        .map((p) => ({ p, r: ratings[p.id] }))
        .filter((x): x is { p: Place; r: PlaceRating } => !!x.r && x.r.count > 0)
        .sort((a, b) => b.r.avg - a.r.avg || b.r.count - a.r.count)
        .slice(0, 10),
    [places, ratings],
  );

  return (
    <Card title="맛집 평가" icon="⭐">
      {/* 선택된 가게 평가 */}
      {!selected ? (
        <Empty>지도나 목록에서 가게를 선택하면 별점을 매길 수 있습니다.</Empty>
      ) : (
        <div className="rounded-lg bg-[var(--surface-2)] p-2.5">
          <div className="mb-1 flex items-baseline gap-1.5">
            <span className="truncate text-[13px] font-bold">{selected.name}</span>
            {ratings[selected.id] && (
              <span className="ml-auto shrink-0 text-[11px] text-[var(--muted)]">
                {ratings[selected.id].avg.toFixed(1)} ({ratings[selected.id].count})
              </span>
            )}
          </div>

          {ratings[selected.id] ? (
            <Stars value={ratings[selected.id].avg} />
          ) : (
            <p className="text-[11px] text-[var(--muted)]">아직 평가가 없습니다</p>
          )}

          <div className="mt-2 border-t border-[var(--border)] pt-2">
            {state.status === "idle" && (
              <>
                <p className="mb-1.5 text-[11.5px] leading-snug text-[var(--muted)]">
                  의왕시 안에 계신 분만 평가할 수 있습니다. 위치를 확인해 주세요.
                </p>
                <button
                  type="button"
                  onClick={request}
                  className="rounded-lg bg-[var(--brand)] px-2.5 py-1.5 text-[11.5px] font-bold text-white"
                >
                  📍 내 위치 확인
                </button>
              </>
            )}

            {state.status === "asking" && (
              <p className="text-[11.5px] text-[var(--muted)]">위치를 확인하는 중…</p>
            )}

            {(state.status === "denied" || state.status === "error") && (
              <>
                <p className="mb-1.5 text-[11.5px] leading-snug text-red-600 dark:text-red-400">
                  {state.message}
                </p>
                <button
                  type="button"
                  onClick={request}
                  className="rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-[11.5px] font-bold"
                >
                  다시 시도
                </button>
              </>
            )}

            {state.status === "ok" && !state.inUiwang && (
              <p className="text-[11.5px] leading-snug text-amber-700 dark:text-amber-300">
                현재 위치가 의왕시 밖으로 확인됩니다. 의왕시 안에서만 평가할 수 있습니다.
                {state.accuracy > 1000 &&
                  ` (위치 오차 약 ${Math.round(state.accuracy)}m — 실외에서 다시 시도해 보세요)`}
              </p>
            )}

            {canRate && (
              <>
                <p className="mb-1 text-[11px] font-bold text-[var(--brand)]">
                  ✓ 의왕시 확인됨 — {mine ? "별점을 수정할 수 있습니다" : "별점을 매겨주세요"}
                </p>
                <StarInput value={mine} onChange={submit} disabled={busy} />
                <textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  maxLength={300}
                  rows={2}
                  placeholder="한 줄 평 (선택)"
                  className="mt-1.5 w-full resize-none rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 text-[12px] outline-none focus:border-[var(--brand)]"
                />
              </>
            )}

            {message && (
              <p className="mt-1.5 text-[11.5px] font-semibold text-[var(--brand)]">
                {message}
              </p>
            )}
          </div>
        </div>
      )}

      {/* 별점 순위 */}
      {ranked.length > 0 && (
        <>
          <h3 className="mb-1.5 mt-3 text-[11px] font-bold text-[var(--muted)]">
            별점 높은 곳
          </h3>
          <ul className="space-y-0.5">
            {ranked.map(({ p, r }, i) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => onSelectPlace(p)}
                  className="flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-left transition hover:bg-[var(--surface-2)]"
                >
                  <span className="w-3 shrink-0 text-[10.5px] font-bold text-[var(--muted)]">
                    {i + 1}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold">
                    {p.name}
                  </span>
                  <Stars value={r.avg} size={11} />
                  <span className="shrink-0 text-[10.5px] font-bold tabular-nums">
                    {r.avg.toFixed(1)}
                  </span>
                  <span className="shrink-0 text-[10px] text-[var(--muted)]">
                    ({r.count})
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      <p className="mt-2.5 border-t border-[var(--border)] pt-2 text-[10px] leading-relaxed text-[var(--muted)]">
        평가는 의왕시 안에서 위치가 확인된 경우에만 가능하고, 한 기기당 가게별 1회입니다.
        가게 정보는 카카오 로컬 기준입니다.
      </p>
    </Card>
  );
}
