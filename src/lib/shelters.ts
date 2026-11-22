import {
  asArray,
  createInFlight,
  createTtlCache,
  normalizeServiceKey,
  timedFetch,
} from "./fetcher";
import { dongFor, isInsideUiwang as inUiwang } from "./geo";
import type { ShelterItem, ShelterKind, SheltersPayload } from "./types";

/**
 * 무더위·한파 쉼터 조회.
 *
 * 1순위: 행정안전부 재난안전데이터공유플랫폼 통합 쉼터 API (DSSP-IF-10941, SAFETY_DATA_KEY)
 *        — 한파쉼터(1), 무더위쉼터(2), 지진옥외대피장소(3) 를 한 번에 지원한다.
 * 2순위: 공공데이터포털 행정안전부_무더위쉼터 (1741000/HeatWaveShelter2, SHELTER_SERVICE_KEY 또는 KMA_SERVICE_KEY)
 */
const SAFETY_ENDPOINT = "https://www.safetydata.go.kr/V2/api/DSSP-IF-10941";
const MOIS_HEAT_ENDPOINT =
  "https://apis.data.go.kr/1741000/HeatWaveShelter2/getHeatWaveShelterList2";

const cache = createTtlCache<SheltersPayload>(6 * 3600_000, 2);
const inFlight = createInFlight<SheltersPayload>();

function mapSafetyKind(code: string | number | undefined): ShelterKind {
  const s = String(code ?? "").trim();
  if (s === "1") return "cold";
  if (s === "3") return "quake";
  return "heat";
}

async function fetchFromSafetyData(rawKey: string): Promise<SheltersPayload> {
  const key = normalizeServiceKey(rawKey);
  const url =
    `${SAFETY_ENDPOINT}?serviceKey=${key}&returnType=json&pageNo=1&numOfRows=300` +
    `&startLot=126.919&endLot=127.057&startLat=37.29&endLat=37.426`;
  const res = await timedFetch(url, {}, 12_000);
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  if (text.trimStart().startsWith("<")) {
    throw new Error("재난안전데이터공유플랫폼 API 인증 오류");
  }

  const json = JSON.parse(text) as {
    header?: { resultCode?: string; resultMsg?: string };
    body?: Record<string, unknown>[];
  };
  if (json.header?.resultCode && json.header.resultCode !== "00") {
    throw new Error(`${json.header.resultCode}: ${json.header.resultMsg ?? "오류"}`);
  }

  const rows = asArray<Record<string, unknown>>(json.body);
  const shelters: ShelterItem[] = [];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const name = String(r.REARE_NM ?? r.RSTR_NM ?? r.SHLT_NM ?? "").trim();
    const addr = String(r.RONA_DADDR ?? r.DTL_ADRES ?? r.ADDR ?? "").trim();
    const lat = Number(r.LAT ?? r.LA);
    const lng = Number(r.LOT ?? r.LO);
    if (!name || !Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    if (!inUiwang(lat, lng)) continue;

    const kind = mapSafetyKind(r.SHLT_SE_CD as string | number | undefined);
    const cap = Number(r.USE_PSBL_NMPR ?? r.ACT_PSBL_NMPR);
    shelters.push({
      id: `sd:${kind}:${r.MNG_SN ?? r.RSTR_FCLTY_NO ?? i}`,
      kind,
      name,
      facilityType: String(r.FCLTY_TY_NM ?? r.SHLT_SE_NM ?? "").trim(),
      address: addr,
      lat,
      lng,
      dong: dongFor(lat, lng) ?? "",
      capacity: Number.isFinite(cap) && cap > 0 ? cap : null,
      useHours: String(r.WKDAY_OPER_BEGIN_TIME ?? "").trim(),
      coolingInfo: "",
    });
  }

  return {
    shelters,
    source: "safetydata",
    updatedAt: new Date().toISOString(),
  };
}

async function fetchFromMoisHeat(rawKey: string): Promise<SheltersPayload> {
  const key = normalizeServiceKey(rawKey);
  const year = new Date(Date.now() + 9 * 3600_000).getUTCFullYear();
  const url =
    `${MOIS_HEAT_ENDPOINT}?ServiceKey=${key}&pageNo=1&numOfRows=300&type=json` +
    `&year=${year}&areaCd=4143000000`;
  const res = await timedFetch(url, {}, 12_000);
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  if (text.trimStart().startsWith("<")) {
    const m = /<returnAuthMsg>([^<]+)<\/returnAuthMsg>|<errMsg>([^<]+)<\/errMsg>/.exec(text);
    throw new Error(m?.[1] || m?.[2] || "무더위쉼터 API 인증 오류");
  }

  const json = JSON.parse(text) as {
    HeatWaveShelter?: Array<{ head?: unknown; row?: Record<string, unknown>[] }>;
    RESULT?: { resultCode?: string; resultMsg?: string };
  };
  if (json.RESULT?.resultCode && json.RESULT.resultCode !== "INFO-0") {
    throw new Error(`${json.RESULT.resultCode}: ${json.RESULT.resultMsg ?? "오류"}`);
  }

  const rowBlock = json.HeatWaveShelter?.find((b) => Array.isArray(b.row));
  const rows = rowBlock?.row ?? [];
  const shelters: ShelterItem[] = [];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const name = String(r.restname ?? "").trim();
    const lat = Number(r.la);
    const lng = Number(r.lo);
    if (!name || !Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    if (!inUiwang(lat, lng)) continue;

    const cap = Number(r.usePsblNmpr);
    const ac = Number(r.colrHoldElefn);
    const fan = Number(r.colrHoldArcndtn);
    const cooling = [
      Number.isFinite(fan) && fan > 0 ? `에어컨 ${fan}` : "",
      Number.isFinite(ac) && ac > 0 ? `선풍기 ${ac}` : "",
    ]
      .filter(Boolean)
      .join(" · ");

    shelters.push({
      id: `mois:heat:${r.restSeqNo ?? i}`,
      kind: "heat",
      name,
      facilityType: String(r.equptype ?? "").trim(),
      address: String(r.restaddr ?? "").trim(),
      lat,
      lng,
      dong: dongFor(lat, lng) ?? "",
      capacity: Number.isFinite(cap) && cap > 0 ? cap : null,
      useHours: String(r.operBeginDe && r.operEndDe ? `${r.operBeginDe}~${r.operEndDe}` : "").trim(),
      coolingInfo: cooling,
    });
  }

  return {
    shelters,
    source: "mois",
    updatedAt: new Date().toISOString(),
  };
}

export async function fetchUiwangShelters(opts: {
  safetyKey?: string;
  moisKey?: string;
}): Promise<SheltersPayload> {
  const hit = cache.get("uiwang");
  if (hit) return hit;

  return inFlight("uiwang", async () => {
    let lastErr: unknown;
    if (opts.safetyKey) {
      try {
        const data = await fetchFromSafetyData(opts.safetyKey);
        if (data.shelters.length > 0) {
          cache.set("uiwang", data);
          return data;
        }
      } catch (e) {
        lastErr = e;
      }
    }
    if (opts.moisKey) {
      const data = await fetchFromMoisHeat(opts.moisKey);
      cache.set("uiwang", data);
      return data;
    }
    throw lastErr ?? new Error("쉼터 API 키가 설정되지 않았습니다");
  });
}
