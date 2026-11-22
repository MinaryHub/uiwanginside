import {
  UIWANG_PARKS,
  UIWANG_PARKING,
  UIWANG_TOILETS,
  UIWANG_SECURITY_CAMS,
} from "./uiwang-facilities";
import { haversine } from "./geo";
import { UIWANG_FACTORIES } from "./uiwang-factories";
import { industryGroup } from "./factories";
import type { FactoryItem, Place } from "./types";

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
export type FacilityKind = "PARK" | "PKG" | "WC" | "SEC" | "MFG";

function fmtArea(m2: number | null): string {
  if (!m2) return "";
  return m2 >= 10_000 ? `${(m2 / 10_000).toFixed(1)}만m²` : `${Math.round(m2).toLocaleString("ko-KR")}m²`;
}

/**
 * 방범 CCTV 는 787곳이라 다른 시설과 달리 화면 안만 준다.
 * 중심에서 가까운 것부터 이만큼만 보낸다.
 */
const SEC_LIMIT = 120;

function inRect(lat: number, lng: number, rect: string | null): boolean {
  if (rect === null) return false;
  const parts = rect.split(",").map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) return false;
  const [minX, minY, maxX, maxY] = parts;
  return lng >= minX && lng <= maxX && lat >= minY && lat <= maxY;
}

export function facilityPlaces(
  kinds: FacilityKind[],
  center: { lat: number; lng: number },
  rect: string | null = null,
  dynamicFactories?: FactoryItem[],
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
        t.cctv ? "CCTV" : "",
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

  if (kinds.includes("SEC")) {
    const near = UIWANG_SECURITY_CAMS.map((c, i) => ({ c, i }))
      .filter(({ c }) => inRect(c.lat, c.lng, rect))
      .map((x) => ({ ...x, d: haversine(center.lat, center.lng, x.c.lat, x.c.lng) }))
      .sort((a, b) => a.d - b.d)
      .slice(0, SEC_LIMIT);
    for (const { c, i } of near) {
      out.push({
        id: `sec:${i}`,
        // 이름이 따로 없는 자료다. 무엇을 위한 카메라인지가 곧 이름이다.
        name: c.purpose,
        category: "SEC",
        categoryName: [c.addr, c.cams > 1 ? `카메라 ${c.cams}대` : "카메라 1대"]
          .filter(Boolean)
          .join(" · "),
        phone: "",
        address: c.addr,
        roadAddress: c.addr,
        lat: c.lat,
        lng: c.lng,
        distance: haversine(center.lat, center.lng, c.lat, c.lng),
        url: "",
      });
    }
  }

  /*
   * 등록 공장 — 우리 동네의 제조업 분포를 지도에 찍는다.
   * 정적 스냅샷이 있으면 우선 쓰고, 없으면 공공 API 로 받아 지오코딩된 공장을 쓴다.
   */
  if (kinds.includes("MFG")) {
    const factories: FactoryItem[] =
      UIWANG_FACTORIES.length > 0 ? UIWANG_FACTORIES : (dynamicFactories ?? []);
    for (const [i, f] of factories.entries()) {
      if (f.lat == null || f.lng == null) continue;
      if (!inRect(f.lat, f.lng, rect)) continue;
      const g = industryGroup(f.industry);
      out.push({
        id: `mfg:${i}`,
        name: f.name,
        category: "MFG",
        categoryName: [
          `${g.emoji} ${g.label}`,
          f.employees != null ? `종업원 ${f.employees}명` : "",
          f.product,
        ]
          .filter(Boolean)
          .join(" · "),
        phone: "",
        address: f.address,
        roadAddress: f.address,
        lat: f.lat,
        lng: f.lng,
        distance: haversine(center.lat, center.lng, f.lat, f.lng),
        url: "",
      });
    }
  }

  return out.sort((a, b) => (a.distance ?? 0) - (b.distance ?? 0));
}
