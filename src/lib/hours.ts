import { UIWANG_HOURS, type OsmHours } from "./uiwang-hours";
import { flatMetres } from "./geo";

/**
 * 장소의 운영시간.
 *
 * 한국에는 개별 가게 영업시간을 주는 공식 오픈 API 가 없다. 있는 것은 둘뿐이다.
 *
 *   병원·약국 — 응급의료 API 가 요일별 진료시간을 준다. 우리가 이미 받아
 *               쓰는 자료라 새로 부를 것이 없다. 다만 그 서비스에
 *               활용신청이 되어 있어야 한다.
 *   그 밖      — OpenStreetMap 에 자원봉사자가 적어둔 것. 의왕 경계 안에
 *               15곳이다. 가게 수에 비하면 거의 없는 셈이라, 나오면
 *               보여주고 없으면 아무 말도 하지 않는다.
 *
 * 없는 것을 그럴듯하게 채우지 않는다. 편의점이라고 24시간이라 적거나
 * 은행이라고 9시~4시라 적으면 대부분 맞지만 어긋나는 곳이 반드시 있고,
 * 그 한 곳 때문에 헛걸음을 한다.
 */

/** 이 안에 있고 이름이 통하면 같은 곳으로 본다 */
const NEAR_M = 80;

function norm(s: string): string {
  return s.replace(/\s|\(.*?\)/g, "").toLowerCase();
}

/**
 * 이름이 서로 통하는지.
 * 카카오 "GS25 의왕삼동점" 과 OSM "GS 25" 처럼 한쪽이 짧을 수 있다.
 */
function nameMatches(a: string, b: string): boolean {
  const x = norm(a);
  const y = norm(b);
  if (!x || !y) return false;
  return x === y || x.includes(y) || y.includes(x);
}

export interface PlaceHours {
  text: string;
  source: "osm";
}

/**
 * OSM 에 적힌 영업시간. 좌표가 가깝고 이름이 통하는 것만 받아들인다.
 * 좌표만으로 고르면 한 건물에 든 다른 가게의 시간을 붙이게 된다.
 */
export function osmHours(place: {
  name: string;
  lat: number;
  lng: number;
}): PlaceHours | null {
  let best: { h: OsmHours; d: number } | null = null;
  for (const h of UIWANG_HOURS) {
    const d = flatMetres(place.lat, place.lng, h.lat, h.lng);
    if (d > NEAR_M) continue;
    if (!nameMatches(place.name, h.name)) continue;
    if (!best || d < best.d) best = { h, d };
  }
  return best ? { text: prettify(best.h.hours), source: "osm" } : null;
}

const DAY_KO: Record<string, string> = {
  Mo: "월",
  Tu: "화",
  We: "수",
  Th: "목",
  Fr: "금",
  Sa: "토",
  Su: "일",
  PH: "공휴일",
};

const MONTH_KO: Record<string, string> = {
  Jan: "1월",
  Feb: "2월",
  Mar: "3월",
  Apr: "4월",
  May: "5월",
  Jun: "6월",
  Jul: "7월",
  Aug: "8월",
  Sep: "9월",
  Oct: "10월",
  Nov: "11월",
  Dec: "12월",
};

/**
 * OSM 문법을 읽기 쉽게 바꾼다.
 *
 * 표준 문법("Mo-Fr 09:00-18:00")과 손으로 적은 자유 문장("평일 09:00~17:00")이
 * 섞여 있다. 알아볼 수 있는 것만 바꾸고 나머지는 그대로 둔다 — 어설프게
 * 해석해 뜻을 바꾸는 것보다 원문이 낫다.
 */
function prettify(raw: string): string {
  if (raw === "24/7") return "24시간";
  return raw
    .split(";")
    .map((part) =>
      part
        .trim()
        .replace(/\s*\|\|\s*/g, " / ")
        .replace(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b/g, (m) => MONTH_KO[m] ?? m)
        .replace(/\b(Mo|Tu|We|Th|Fr|Sa|Su|PH)\b/g, (d) => DAY_KO[d] ?? d)
        .replace(/\b(closed|off)\b/gi, "휴무")
        .replace(/(?<=[가-힣])-(?=[가-힣0-9])/g, "~"),
    )
    .join(" · ");
}
