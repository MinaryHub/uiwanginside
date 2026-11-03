"use client";

import SchoolFacts from "@/components/SchoolFacts";
import PlaceHours from "@/components/PlaceHours";
import { CATEGORY_MAP } from "@/lib/uiwang";
import type { MedicalPlace, Place } from "@/lib/types";

/**
 * 지도에서 선택한 장소의 상세 카드.
 *
 * 지도 위에 겹쳐 띄운다. 마커 옆에 붙이는 말풍선은 화면 끝에서 잘리고
 * 모바일에서 특히 좁아, 하단 고정 카드로 두어 어디를 눌러도 같은 자리에
 * 같은 크기로 나오게 했다.
 */
export default function PlaceDetailCard({
  place,
  medical,
  medicalDay,
  onClose,
}: {
  place: Place;
  /** 앱이 이미 받아둔 진료중 병원·약국 목록 — 병원 진료시간을 여기서 찾는다 */
  medical: MedicalPlace[];
  /** 1=월 … 7=일 */
  medicalDay: number;
  onClose: () => void;
}) {
  const def = CATEGORY_MAP[place.category];
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

        <PlaceHours place={place} medical={medical} day={medicalDay} />

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

        {/* 학교는 이름·주소만으로는 부족하다 — 학부모가 볼 것을 덧붙인다 */}
        {place.category === "SC4" && <SchoolFacts name={place.name} />}

      </div>
    </div>
  );
}
