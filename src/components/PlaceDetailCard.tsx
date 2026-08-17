"use client";

import { useState } from "react";
import { Stars, StarInput } from "@/components/StarRating";
import { useRating } from "@/lib/useRating";
import SaveToList from "@/components/SaveToList";
import { CATEGORY_MAP } from "@/lib/uiwang";
import type { Place, PlaceRating } from "@/lib/types";

/**
 * 지도에서 선택한 장소의 상세 카드.
 *
 * 지도 위에 겹쳐 띄운다. 마커 옆에 붙이는 말풍선은 화면 끝에서 잘리고
 * 모바일에서 특히 좁아, 하단 고정 카드로 두어 어디를 눌러도 같은 자리에
 * 같은 크기로 나오게 했다.
 */
export default function PlaceDetailCard({
  place,
  rating,
  showRating,
  onClose,
  onRated,
}: {
  place: Place;
  rating?: PlaceRating;
  /** 맛집 모드에서만 별점 입력을 띄운다 */
  showRating: boolean;
  onClose: () => void;
  onRated: (placeId: string, rating: PlaceRating) => void;
}) {
  const def = CATEGORY_MAP[place.category];
  const { state, request, canRate, busy, message, submit } = useRating(onRated);
  const [comment, setComment] = useState("");
  // 다른 장소를 고르면 입력과 안내가 초기화된다.
  // Dashboard 에서 place.id 를 key 로 넘겨 컴포넌트를 새로 마운트하므로
  // effect 로 상태를 지울 필요가 없다.

  const distance =
    place.distance == null
      ? null
      : place.distance >= 1000
        ? `${(place.distance / 1000).toFixed(1)}km`
        : `${place.distance}m`;

  /** 카카오맵 길찾기 — 앱이 있으면 앱으로, 없으면 웹으로 열린다 */
  const directionsUrl = `https://map.kakao.com/link/to/${encodeURIComponent(
    place.name,
  )},${place.lat},${place.lng}`;

  return (
    <div className="pointer-events-auto fade-up absolute inset-x-3 bottom-3 z-30 mx-auto max-w-[440px] overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-lg)]">
      <div className="p-3.5">
        <div className="flex items-start gap-2">
          <span
            aria-hidden
            className="grid h-9 w-9 shrink-0 place-items-center rounded-[var(--radius)] text-[1.05rem]"
            style={{ background: `color-mix(in srgb, ${def.color} 15%, transparent)` }}
          >
            {def.emoji}
          </span>

          <div className="min-w-0 flex-1">
            <h3 className="truncate text-[var(--text-base)] font-extrabold">
              {place.name}
            </h3>
            <p className="mt-0.5 flex items-center gap-1.5 text-[var(--text-xs)] text-[var(--text-muted)]">
              <span style={{ color: def.color }} className="font-bold">
                {def.label}
              </span>
              {distance && <span>· {distance}</span>}
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-[var(--radius)] text-[var(--text-base)] text-[var(--text-muted)] transition hover:bg-[var(--surface-2)]"
          >
            ✕
          </button>
        </div>

        {/* 별점 — 지도 마커가 아니라 여기서 보여준다 */}
        {rating ? (
          <div className="mt-3 flex items-center gap-2 rounded-[var(--radius)] bg-[var(--surface-2)] px-3 py-2.5">
            <span className="tnum text-[var(--text-xl)] font-extrabold leading-none">
              {rating.avg.toFixed(1)}
            </span>
            <div className="min-w-0">
              <Stars value={rating.avg} size={14} />
              <div className="mt-0.5 text-[var(--text-2xs)] text-[var(--text-muted)]">
                시민 평가 {rating.count}건
                {rating.mine ? ` · 내 별점 ${rating.mine}점` : ""}
              </div>
            </div>
          </div>
        ) : (
          showRating && (
            <p className="mt-3 text-[var(--text-xs)] text-[var(--text-faint)]">
              아직 평가가 없습니다. 첫 번째로 별점을 남겨보세요.
            </p>
          )
        )}

        {(place.roadAddress || place.address) && (
          <p className="mt-2 text-[var(--text-xs)] leading-relaxed text-[var(--text-muted)]">
            {place.roadAddress || place.address}
          </p>
        )}

        {/* 바로 할 수 있는 행동을 한 줄에 */}
        <div className="mt-3 flex gap-1.5">
          {place.phone && (
            <a
              href={`tel:${place.phone}`}
              className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-[var(--radius)] bg-[var(--brand)] text-[var(--text-sm)] font-bold text-[var(--on-brand)]"
            >
              📞 전화
            </a>
          )}
          <a
            href={directionsUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-[var(--radius)] border border-[var(--border-strong)] text-[var(--text-sm)] font-bold"
          >
            🧭 길찾기
          </a>
          {place.url && (
            <a
              href={place.url}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex min-h-[44px] items-center justify-center rounded-[var(--radius)] border border-[var(--border-strong)] px-3 text-[var(--text-sm)] font-bold"
              title="카카오맵에서 보기"
            >
              ↗
            </a>
          )}
        </div>

        <SaveToList place={place} />

        {showRating && (
          <div className="mt-3 border-t border-[var(--border)] pt-3">
            {canRate ? (
              <>
                <p className="mb-1.5 text-[var(--text-xs)] font-bold text-[var(--brand)]">
                  ✓ 의왕시 확인됨 —{" "}
                  {rating?.mine ? "별점을 수정할 수 있습니다" : "별점을 매겨주세요"}
                </p>
                <StarInput
                  value={rating?.mine ?? null}
                  onChange={(n) => submit(place, n, comment)}
                  disabled={busy}
                  size={28}
                />
                <input
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  maxLength={300}
                  placeholder="한 줄 평 (선택) — 별을 누르면 함께 저장됩니다"
                  className="mt-2 w-full rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface-2)] px-2.5 py-2 text-[var(--text-xs)] outline-none focus:border-[var(--brand)]"
                />
              </>
            ) : state.status === "idle" ? (
              <button
                type="button"
                onClick={() => request()}
                className="inline-flex min-h-[44px] w-full items-center justify-center rounded-[var(--radius)] bg-[var(--surface-2)] text-[var(--text-sm)] font-bold text-[var(--text)]"
              >
                📍 위치 확인하고 별점 매기기
              </button>
            ) : state.status === "asking" ? (
              <p className="text-[var(--text-xs)] text-[var(--text-muted)]">
                위치를 확인하는 중…
              </p>
            ) : state.status === "ok" && !state.inUiwang ? (
              <p className="text-[var(--text-xs)] leading-relaxed text-[var(--warn)]">
                현재 위치가 의왕시 밖으로 확인됩니다. 평가는 의왕시 안에서만 가능합니다.
              </p>
            ) : (
              <div>
                <p className="mb-1.5 text-[var(--text-xs)] leading-relaxed text-[var(--danger)]">
                  {state.status === "denied" || state.status === "error"
                    ? state.message
                    : ""}
                </p>
                <button
                  type="button"
                  onClick={() => request()}
                  className="inline-flex min-h-[40px] items-center rounded-[var(--radius)] border border-[var(--border-strong)] px-3 text-[var(--text-xs)] font-bold"
                >
                  다시 시도
                </button>
              </div>
            )}

            {message && (
              <p className="mt-1.5 text-[var(--text-xs)] font-semibold text-[var(--brand)]">
                {message}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
