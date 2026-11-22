import {
  asArray,
  createInFlight,
  createTtlCache,
  normalizeServiceKey,
  timedFetch,
} from "./fetcher";
import { dongFor, isInsideUiwang as inUiwang } from "./geo";
import type { EvChargersPayload, EvStation } from "./types";

/**
 * 한국환경공단 전기자동차 충전소 정보 (data.go.kr 15076352).
 *
 * zcode=41(경기도), zscode=41430(의왕시) 으로 의왕시 관내 충전기를 조회하고
 * statId(충전소) 단위로 묶어 현재 충전 가능 대수와 급속/완속 구성을 계산한다.
 */
const KECO_ENDPOINT = "https://apis.data.go.kr/B552584/EvCharger/getChargerInfo";
const UIWANG_ZCODE = "41";
const UIWANG_ZSCODE = "41430";

/** 급속 충전기 타입 코드 (DC차데모·AC3상·DC콤보 등) */
const FAST_TYPES = new Set(["01", "03", "04", "05", "06", "09", "10"]);

interface RawCharger {
  statNm?: string;
  statId?: string;
  chgerId?: string;
  chgerType?: string;
  addr?: string;
  lat?: string | number;
  lng?: string | number;
  useTime?: string;
  busiNm?: string;
  stat?: string | number;
  output?: string | number;
  parkingFree?: string;
  limitYn?: string;
  limitDetail?: string;
}

const cache = createTtlCache<EvChargersPayload>(3 * 60_000, 2);
const inFlight = createInFlight<EvChargersPayload>();

export async function fetchEvChargers(rawKey: string): Promise<EvChargersPayload> {
  const hit = cache.get("uiwang");
  if (hit) return hit;

  return inFlight("uiwang", async () => {
    const key = normalizeServiceKey(rawKey);
    const url =
      `${KECO_ENDPOINT}?serviceKey=${key}&pageNo=1&numOfRows=999` +
      `&zcode=${UIWANG_ZCODE}&zscode=${UIWANG_ZSCODE}&dataType=JSON`;

    const res = await timedFetch(url, {}, 12_000);
    const text = await res.text();
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    if (text.trimStart().startsWith("<")) {
      const m = /<returnAuthMsg>([^<]+)<\/returnAuthMsg>|<errMsg>([^<]+)<\/errMsg>/.exec(text);
      throw new Error(m?.[1] || m?.[2] || "전기차 충전소 API 인증/호출 오류");
    }

    const json = JSON.parse(text) as {
      resultCode?: string;
      resultMsg?: string;
      items?: { item?: RawCharger | RawCharger[] } | RawCharger[];
    };
    if (json.resultCode && json.resultCode !== "00") {
      throw new Error(`${json.resultCode}: ${json.resultMsg ?? "오류"}`);
    }

    const rawList = Array.isArray(json.items)
      ? json.items
      : asArray<RawCharger>(json.items?.item);

    const byStation = new Map<string, EvStation>();
    for (const r of rawList) {
      const id = String(r.statId ?? "").trim();
      const name = String(r.statNm ?? "").trim();
      const lat = Number(r.lat);
      const lng = Number(r.lng);
      if (!id || !name || !Number.isFinite(lat) || !Number.isFinite(lng)) continue;
      if (!inUiwang(lat, lng) && !String(r.addr ?? "").includes("의왕")) continue;

      let st = byStation.get(id);
      if (!st) {
        const pf = String(r.parkingFree ?? "").toUpperCase();
        st = {
          id,
          name,
          address: String(r.addr ?? "").trim(),
          lat,
          lng,
          dong: dongFor(lat, lng) ?? "",
          operator: String(r.busiNm ?? "").trim(),
          useTime: String(r.useTime ?? "").trim(),
          parkingFree: pf === "Y" ? true : pf === "N" ? false : null,
          limitYn: String(r.limitYn ?? "").toUpperCase() === "Y",
          limitDetail: String(r.limitDetail ?? "").trim(),
          available: 0,
          charging: 0,
          total: 0,
          fastCount: 0,
          slowCount: 0,
          maxOutputKw: null,
        };
        byStation.set(id, st);
      }

      st.total += 1;
      const stat = String(r.stat ?? "").trim();
      if (stat === "2") st.available += 1;
      else if (stat === "3") st.charging += 1;

      const ctype = String(r.chgerType ?? "").trim().padStart(2, "0");
      if (FAST_TYPES.has(ctype)) st.fastCount += 1;
      else st.slowCount += 1;

      const out = Number(r.output);
      if (Number.isFinite(out) && out > 0) {
        st.maxOutputKw = st.maxOutputKw == null ? out : Math.max(st.maxOutputKw, out);
      }
    }

    const stations = [...byStation.values()].sort(
      (a, b) =>
        b.available - a.available ||
        b.fastCount - a.fastCount ||
        b.total - a.total ||
        a.name.localeCompare(b.name, "ko"),
    );

    const payload: EvChargersPayload = {
      stations,
      source: "keco",
      updatedAt: new Date().toISOString(),
    };
    cache.set("uiwang", payload);
    return payload;
  });
}
