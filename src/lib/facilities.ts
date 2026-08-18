import { UIWANG_PARKS, UIWANG_PARKING, UIWANG_TOILETS } from "./uiwang-facilities";
import { haversine } from "./busStations";
import type { Place } from "./types";

/**
 * 표준데이터로 온 시설을 장소로 바꾼다.
 *
 * 지도 마커·목록·상세 카드는 이미 Place 를 다룬다. 새 자료마다 새 레이어를
 * 만드는 대신 Place 로 맞추면 그 모든 것이 그대로 동작한다.
 *
 * 카카오에도 주차장(PK6)이 있지만 요금과 운영시간을 주지 않는다. 표준
 * 데이터는 그것까지 주므로 이쪽을 쓴다 — 시민이 알고 싶은 것은 주차장이
 * 어디 있느냐보다 얼마고 몇 시까지냐다.
 */
export type FacilityKind = "PARK" | "PKG" | "WC";

function fmtArea(m2: number | null): string {
  if (!m2) return "";
  return m2 >= 10_000 ? `${(m2 / 10_000).toFixed(1)}만m²` : `${Math.round(m2).toLocaleString("ko-KR")}m²`;
}

/**
 * 상세 카드는 categoryName 을 부제로 보여준다. 그 한 줄에 이 시설에서
 * 가장 궁금할 것을 담는다 — 주차장은 요금, 화장실은 갖춰진 것.
 */
export function facilityPlaces(
  kinds: FacilityKind[],
  center: { lat: number; lng: number },
): Place[] {
  const out: Place[] = [];

  if (kinds.includes("PARK")) {
    for (const [i, p] of UIWANG_PARKS.entries()) {
      out.push({
        id: `park:${i}`,
        name: p.name,
        category: "PARK",
        categoryName: [p.kind, fmtArea(p.area)].filter(Boolean).join(" · "),
        phone: "",
        address: p.addr,
        roadAddress: p.addr,
        lat: p.lat,
        lng: p.lng,
        distance: haversine(center.lat, center.lng, p.lat, p.lng),
        url: "",
      });
    }
  }

  if (kinds.includes("PKG")) {
    for (const [i, p] of UIWANG_PARKING.entries()) {
      const free = p.fee.includes("무료");
      const bits = [
        p.fee,
        // 무료인데 "0분 0원" 을 적으면 요금이 있는 것처럼 읽힌다
        free ? "" : p.charge,
        p.slots ? `${p.slots}면` : "",
        // 00:00~23:59 는 사실상 24시간이라 그렇게 적는다
        p.weekday === "00:00~23:59" ? "24시간" : p.weekday,
      ].filter(Boolean);
      out.push({
        id: `pkg:${i}`,
        name: p.name,
        category: "PKG",
        categoryName: bits.join(" · "),
        phone: "",
        address: p.addr,
        roadAddress: p.addr,
        lat: p.lat,
        lng: p.lng,
        distance: haversine(center.lat, center.lng, p.lat, p.lng),
        url: "",
      });
    }
  }

  if (kinds.includes("WC")) {
    for (const [i, t] of UIWANG_TOILETS.entries()) {
      const bits = [
        t.hours,
        t.diaper ? "기저귀교환대" : "",
        t.disabled ? "장애인용" : "",
        t.bell ? "비상벨" : "",
      ].filter(Boolean);
      out.push({
        id: `wc:${i}`,
        name: t.name,
        category: "WC",
        categoryName: bits.join(" · "),
        phone: "",
        address: t.addr,
        roadAddress: t.addr,
        lat: t.lat,
        lng: t.lng,
        distance: haversine(center.lat, center.lng, t.lat, t.lng),
        url: "",
      });
    }
  }

  return out.sort((a, b) => (a.distance ?? 0) - (b.distance ?? 0));
}

export const FACILITY_COUNTS = {
  PARK: UIWANG_PARKS.length,
  PKG: UIWANG_PARKING.length,
  WC: UIWANG_TOILETS.length,
} as const;
