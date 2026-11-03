"use client";

import { osmHours } from "@/lib/hours";
import type { MedicalPlace, Place } from "@/lib/types";

/**
 * 운영시간.
 *
 * 병원·약국은 응급의료 API 가 요일별 진료시간을 준다. 앱이 이미 그 목록을
 * 받아 두고 있으므로 새로 부르지 않고 여기서 짝을 찾는다.
 *
 * 그 밖의 가게는 공식 출처가 없다. OSM 에 적힌 것이 의왕 경계 안에
 * 열다섯 곳뿐이다. 나오면 보여주고 없으면 아무 말도 하지 않는다 —
 * "영업시간 정보 없음" 을 매번 띄우면 그것만 눈에 남는다.
 */
const NEAR_M = 120;

function norm(s: string) {
  return s.replace(/\s|\(.*?\)/g, "");
}

/**
 * 카카오 장소와 응급의료 목록의 짝을 찾는다.
 *
 * 이름이 같은 것을 먼저 보고, 없으면 아주 가까운 것을 본다. 둘 다
 * 느슨하게 잡으면 옆 건물 병원의 진료시간을 붙이게 되므로, 이름이
 * 다를 때는 거리를 좁게 둔다.
 */
function matchMedical(place: Place, list: MedicalPlace[]): MedicalPlace | null {
  const target = norm(place.name);
  let nearest: { m: MedicalPlace; d: number } | null = null;

  for (const m of list) {
    if (m.lat == null || m.lng == null) continue;
    const d = Math.hypot((place.lat - m.lat) * 111_000, (place.lng - m.lng) * 88_000);
    if (d > NEAR_M) continue;
    const n = norm(m.name);
    if (n === target || n.includes(target) || target.includes(n)) return m;
    if (!nearest || d < nearest.d) nearest = { m, d };
  }
  // 이름이 안 맞으면 40m 안쪽만 같은 곳으로 본다
  return nearest && nearest.d <= 40 ? nearest.m : null;
}

const DAY_KO = ["", "월", "화", "수", "목", "금", "토", "일"];

export default function PlaceHours({
  place,
  medical,
  day,
}: {
  place: Place;
  /** 앱이 이미 받아둔 진료중 병원·약국 목록 */
  medical: MedicalPlace[];
  /** 1=월 … 7=일 */
  day: number;
}) {
  const isClinic = place.category === "HP8" || place.category === "PM9";
  const med = isClinic ? matchMedical(place, medical) : null;

  if (med && (med.todayStart || med.todayClose)) {
    return (
      <div className="mt-2 flex items-center gap-2">
        <span className="text-[length:var(--text-2xs)] font-bold text-[var(--text-muted)]">
          {DAY_KO[day] ? `${DAY_KO[day]}요일 진료` : "진료시간"}
        </span>
        <span className="text-[length:var(--text-xs)] font-semibold tabular-nums">
          {med.todayStart || "?"} ~ {med.todayClose || "?"}
        </span>
        {med.openNow !== null && (
          <span
            className="rounded-full px-2 py-0.5 text-[length:var(--text-2xs)] font-bold"
            style={
              med.openNow
                ? { background: "var(--ok)", color: "#fff" }
                : { background: "var(--surface-2)", color: "var(--text-muted)" }
            }
          >
            {med.openNow ? "진료중" : "진료 종료"}
          </span>
        )}
      </div>
    );
  }

  const osm = osmHours(place);
  if (osm) {
    return (
      <div className="mt-2 flex items-baseline gap-2">
        <span className="shrink-0 text-[length:var(--text-2xs)] font-bold text-[var(--text-muted)]">
          영업시간
        </span>
        <span className="text-[length:var(--text-xs)] font-semibold">{osm.text}</span>
        <span
          title="OpenStreetMap 기여자가 적어둔 정보입니다 (ODbL). 실제와 다를 수 있습니다."
          className="shrink-0 text-[length:var(--text-2xs)] text-[var(--text-faint)]"
        >
          OSM
        </span>
      </div>
    );
  }

  /*
   * 아는 것이 없을 때.
   *
   * "정보 없음" 을 띄우면 그것만 눈에 남는다. 그렇다고 아무것도 두지
   * 않으면 영업시간을 찾으러 온 사람이 어디를 봐야 할지 모른다.
   * 카카오맵 상세 페이지에는 대개 적혀 있으니 그리로 보낸다 — 이미
   * 아래 행동 줄에 화살표 버튼이 있지만, 그것이 영업시간으로 가는
   * 길이라는 것은 눌러 봐야 안다.
   *
   * 학교는 빼둔다. 아래에 학교 홈페이지를 따로 붙이고 있다.
   */
  if (!place.url || place.category === "SC4") return null;

  return (
    <a
      href={place.url}
      target="_blank"
      rel="noreferrer noopener"
      className="mt-2 flex items-baseline gap-2"
    >
      <span className="shrink-0 text-[length:var(--text-2xs)] font-bold text-[var(--text-muted)]">
        영업시간
      </span>
      <span className="text-[length:var(--text-xs)] font-semibold text-[var(--brand)] underline underline-offset-2">
        카카오맵에서 보기 ↗
      </span>
    </a>
  );
}
