import {
  timedFetch,
  normalizeServiceKey,
  createTtlCache,
  createInFlight,
  nowISO,
} from "./fetcher";
import { dongFor, isInsideUiwang } from "./geo";
import { UIWANG_FACTORIES, FACTORIES_AS_OF } from "./uiwang-factories";
import { getSql, ensureSchema, hasDb } from "./db";
import type { FactoriesPayload, FactoryItem } from "./types";

/**
 * 경기도 의왕시 공장 현황 — 공공데이터포털 파일데이터 오픈API (ODCloud 15126591).
 *
 * 1) 정적 스냅샷(uiwang-factories.ts)이 채워져 있으면 즉시 그것을 돌려준다.
 * 2) 비어 있으면 공공데이터포털 ODCloud API 에서 실시간(24시간 캐시)으로 받아온다.
 *    OAS 명세(infuser.odcloud.kr)에서 최신 uddi 경로를 자동 탐색해 연 1회 갱신에도
 *    엔드포인트가 끊기지 않게 한다.
 * 3) 원본에는 좌표가 없어 KAKAO_REST_KEY 가 있으면 건물 단위로 중복을 줄여 지오코딩하고
 *    Neon DB(factory_coords)에 캐시한다. 좌표가 아직 없는 항목도 주소의 법정동으로
 *    행정동을 판정해 동별·업종별 통계를 즉시 제공한다.
 */

export const ODCLOUD_NAMESPACE = "15126591/v1";
const OAS_URL = `https://infuser.odcloud.kr/oas/docs?namespace=${ODCLOUD_NAMESPACE}`;
const FALLBACK_PATH = "/15126591/v1/uddi:b1b7adc0-0076-4cdc-95a9-b490484f4964";
const FALLBACK_AS_OF = "2025-05-30";

const cache = createTtlCache<FactoriesPayload>(24 * 3600_000, 2);
const inFlight = createInFlight<FactoriesPayload>();
const coordMem = new Map<string, { lat: number | null; lng: number | null; dong: string | null }>();

/** 건물 단위 대표주소로 정규화 (층·호·괄호 제거) — 같은 지식산업센터 수십 곳을 1회만 지오코딩 */
export function cleanBuildingAddress(addr: string): string {
  return addr
    .replace(/\(.*?\)/g, " ")
    .replace(/,.*$/, "")
    .replace(/\s+\d+층.*$/, "")
    .replace(/\s+[A-Za-z가-힣]동\s+\d+.*$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * 주소의 법정동 글자로 행정동을 추정한다 (좌표 지오코딩 전 보조 판정).
 * 의왕시 법정동 → 행정동 대응:
 *   고천동·왕곡동 → 고천동
 *   삼동·이동·월암동·초평동 → 부곡동
 *   오전동 → 오전동
 *   내손동 → 내손1동 (지오코딩되면 실제 경계로 내손1/2동 정확히 분리)
 *   포일동·청계동·학의동 → 청계동
 */
function inferDongFromAddress(addr: string): string {
  if (/고천동|왕곡동/.test(addr)) return "고천동";
  if (/삼동|이동|월암동|초평동|부곡동|오봉산단/.test(addr)) return "부곡동";
  if (/오전동|오전공업/.test(addr)) return "오전동";
  if (/내손2동/.test(addr)) return "내손2동";
  if (/내손1동|내손동/.test(addr)) return "내손1동";
  if (/포일동|청계동|학의동|이미로/.test(addr)) return "청계동";
  return "";
}

/** OAS 명세에서 최신 uddi 경로와 기준일(YYYY-MM-DD)을 찾는다 */
export async function resolveOdcloudEndpoint(): Promise<{ path: string; asOf: string }> {
  try {
    const res = await timedFetch(OAS_URL, {}, 6_000);
    if (res.ok) {
      const spec = (await res.json()) as {
        paths?: Record<string, { get?: { summary?: string } }>;
      };
      const entries = Object.entries(spec.paths ?? {}).filter(([p]) =>
        p.includes("/15126591/v1/uddi:"),
      );
      if (entries.length > 0) {
        // 여러 버전이 있으면 summary 의 날짜(YYYYMMDD)가 가장 최신인 것을 선택
        entries.sort((a, b) => {
          const da = a[1]?.get?.summary?.match(/(\d{8})/)?.[1] ?? "";
          const db = b[1]?.get?.summary?.match(/(\d{8})/)?.[1] ?? "";
          return db.localeCompare(da);
        });
        const [path, def] = entries[0];
        const rawDate = def?.get?.summary?.match(/(\d{4})(\d{2})(\d{2})/);
        const asOf = rawDate ? `${rawDate[1]}-${rawDate[2]}-${rawDate[3]}` : FALLBACK_AS_OF;
        return { path, asOf };
      }
    }
  } catch (e) {
    console.warn("[factories:oas]", e instanceof Error ? e.message : e);
  }
  return { path: FALLBACK_PATH, asOf: FALLBACK_AS_OF };
}

interface RawFactoryRow {
  회사명?: string;
  "공장대표주소(도로명)"?: string;
  "공장대표주소(지번)"?: string;
  업종명?: string;
  종업원수?: string | number;
  생산품?: string;
  [k: string]: unknown;
}

function pickCol(row: RawFactoryRow, ...patterns: RegExp[]): string {
  for (const p of patterns) {
    for (const [k, v] of Object.entries(row)) {
      if (p.test(k) && v != null && String(v).trim() !== "") return String(v).trim();
    }
  }
  return "";
}

async function fetchOdcloudRows(key: string): Promise<{ rows: RawFactoryRow[]; asOf: string }> {
  const { path, asOf } = await resolveOdcloudEndpoint();
  const encodedKey = normalizeServiceKey(key);
  const perPage = 1000;
  const rows: RawFactoryRow[] = [];

  for (let page = 1; page <= 5; page++) {
    const url =
      `https://api.odcloud.kr/api${path}` +
      `?page=${page}&perPage=${perPage}&serviceKey=${encodedKey}`;
    const res = await timedFetch(url, {}, 12_000);
    if (!res.ok) {
      throw new Error(`odcloud ${res.status}: ${(await res.text()).slice(0, 140)}`);
    }
    const json = (await res.json()) as {
      data?: RawFactoryRow[];
      currentCount?: number;
      totalCount?: number;
    };
    const batch = json.data ?? [];
    rows.push(...batch);
    if (batch.length < perPage || (json.totalCount != null && rows.length >= json.totalCount)) {
      break;
    }
  }
  return { rows, asOf };
}

async function loadCoordsFromDb(addrs: string[]) {
  if (!hasDb() || addrs.length === 0) return;
  try {
    await ensureSchema();
    const sql = getSql();
    const rows = (await sql`
      SELECT addr, lat, lng, dong FROM factory_coords WHERE addr = ANY(${addrs}::text[])
    `) as { addr: string; lat: number | null; lng: number | null; dong: string | null }[];
    for (const r of rows) {
      coordMem.set(r.addr, { lat: r.lat, lng: r.lng, dong: r.dong });
    }
  } catch (e) {
    console.error("[factories:db-load]", e);
  }
}

async function saveCoordsToDb(
  entries: { addr: string; lat: number | null; lng: number | null; dong: string | null }[],
) {
  if (!hasDb() || entries.length === 0) return;
  try {
    await ensureSchema();
    const sql = getSql();
    const addrs = entries.map((e) => e.addr);
    const lats = entries.map((e) => e.lat);
    const lngs = entries.map((e) => e.lng);
    const dongs = entries.map((e) => e.dong);
    await sql`
      INSERT INTO factory_coords (addr, lat, lng, dong, at)
      SELECT addr, lat, lng, dong, now()
      FROM unnest(${addrs}::text[], ${lats}::double precision[], ${lngs}::double precision[], ${dongs}::text[])
        AS t(addr, lat, lng, dong)
      ON CONFLICT (addr) DO UPDATE
        SET lat = EXCLUDED.lat, lng = EXCLUDED.lng, dong = EXCLUDED.dong, at = now()
    `;
  } catch (e) {
    console.error("[factories:db-save]", e);
  }
}

async function geocodeOne(
  kakaoKey: string,
  addr: string,
): Promise<{ lat: number | null; lng: number | null; dong: string | null }> {
  const query = addr.includes("의왕") ? addr : `경기도 의왕시 ${addr}`;
  try {
    const res = await timedFetch(
      `https://dapi.kakao.com/v2/local/search/address.json?query=${encodeURIComponent(query)}`,
      { headers: { Authorization: `KakaoAK ${kakaoKey}` } },
      4_000,
    );
    if (!res.ok) return { lat: null, lng: null, dong: null };
    const doc = ((await res.json()) as { documents?: { x: string; y: string }[] }).documents?.[0];
    if (!doc) return { lat: null, lng: null, dong: null };
    const lat = Math.round(Number(doc.y) * 1e6) / 1e6;
    const lng = Math.round(Number(doc.x) * 1e6) / 1e6;
    if (!isInsideUiwang(lat, lng)) return { lat: null, lng: null, dong: null };
    return { lat, lng, dong: dongFor(lat, lng) };
  } catch {
    return { lat: null, lng: null, dong: null };
  }
}

/**
 * 한 번의 요청이 타임아웃되지 않도록 미변환 건물 주소 중 상위 N개만 지오코딩한다.
 * 의왕 공장은 인덕원IT밸리·의왕테크노파크 등 지식산업센터에 밀집해 있어,
 * 공장이 많은 건물부터 먼저 변환하면 소수의 호출로도 대다수 공장이 지도에 올라온다.
 */
const GEOCODE_BUDGET_PER_REQ = 30;

export async function loadFactories(
  schedule?: (work: () => Promise<void>) => void,
): Promise<FactoriesPayload> {
  if (UIWANG_FACTORIES.length > 0) {
    return {
      asOf: FACTORIES_AS_OF,
      factories: UIWANG_FACTORIES,
      source: "snapshot",
      updatedAt: nowISO(),
    };
  }

  const cached = cache.get("factories");
  if (cached) return cached;

  const key = process.env.FACTORY_SERVICE_KEY ?? process.env.KMA_SERVICE_KEY;
  if (!key) {
    throw new Error("공장 현황 API 인증키(FACTORY_SERVICE_KEY 또는 KMA_SERVICE_KEY)가 설정되지 않았습니다.");
  }

  return inFlight("factories", async () => {
    const { rows, asOf } = await fetchOdcloudRows(key);

    // 건물 주소 빈도 계산 — 공장이 많이 입주한 건물부터 지오코딩
    const freq = new Map<string, number>();
    const parsed = rows
      .map((r) => {
        const name = pickCol(r, /^회사명/, /회사|업체|상호/);
        if (!name) return null;
        const road = pickCol(r, /도로명/, /공장대표주소/, /주소/);
        const jibun = pickCol(r, /지번/);
        const address = road || jibun;
        const clean = address ? cleanBuildingAddress(address) : "";
        if (clean) freq.set(clean, (freq.get(clean) ?? 0) + 1);
        const empRaw = pickCol(r, /종업원/, /근로자|직원/).replace(/[^\d]/g, "");
        const emp = empRaw !== "" ? Number(empRaw) : null;
        const industry = pickCol(r, /업종명/, /업종/).split(/[/|\n]/)[0].trim();
        const product = pickCol(r, /생산품/, /제품/).slice(0, 40);
        return {
          name,
          address,
          jibun,
          clean,
          industry,
          employees: emp != null && Number.isFinite(emp) ? emp : null,
          product,
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);

    const uniqueAddrs = [...freq.keys()];
    const unknownAddrs = uniqueAddrs.filter((a) => !coordMem.has(a));
    if (unknownAddrs.length > 0) {
      await loadCoordsFromDb(unknownAddrs);
    }

    const kakaoKey = process.env.KAKAO_REST_KEY;
    const toGeocode = uniqueAddrs
      .filter((a) => !coordMem.has(a))
      .sort((a, b) => (freq.get(b) ?? 0) - (freq.get(a) ?? 0))
      .slice(0, GEOCODE_BUDGET_PER_REQ);

    if (kakaoKey && toGeocode.length > 0) {
      const newlyGeocoded: { addr: string; lat: number | null; lng: number | null; dong: string | null }[] = [];
      for (let i = 0; i < toGeocode.length; i += 6) {
        const batch = toGeocode.slice(i, i + 6);
        const res = await Promise.all(batch.map(async (addr) => ({ addr, ...(await geocodeOne(kakaoKey, addr)) })));
        for (const item of res) {
          coordMem.set(item.addr, { lat: item.lat, lng: item.lng, dong: item.dong });
          newlyGeocoded.push(item);
        }
      }
      if (newlyGeocoded.length > 0) {
        if (schedule) schedule(() => saveCoordsToDb(newlyGeocoded));
        else await saveCoordsToDb(newlyGeocoded);
      }
    }

    const factories: FactoryItem[] = parsed.map((p) => {
      const geo = p.clean ? coordMem.get(p.clean) : undefined;
      const dong =
        geo?.dong || inferDongFromAddress(`${p.address} ${p.jibun}`) || "의왕시";
      return {
        name: p.name,
        industry: p.industry,
        employees: p.employees,
        product: p.product,
        address: p.address,
        dong,
        lat: geo?.lat ?? null,
        lng: geo?.lng ?? null,
      };
    });

    const payload: FactoriesPayload = {
      asOf,
      factories,
      source: "odcloud",
      updatedAt: nowISO(),
    };
    // 아직 지오코딩 남은 건물이 있으면 캐시를 짧게 두어 다음 요청에서 이어 채운다
    const remaining = uniqueAddrs.some((a) => !coordMem.has(a));
    cache.set("factories", payload, remaining && kakaoKey ? 5 * 60_000 : undefined);
    return payload;
  });
}
