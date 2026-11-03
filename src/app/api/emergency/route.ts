import { XMLParser } from "fast-xml-parser";
import { timedFetch, ok, fail, nowISO, createTtlCache, parseDataGoKr } from "@/lib/fetcher";
import { UIWANG } from "@/lib/uiwang";
import { haversine } from "@/lib/busStations";
import type { EmergencyPayload, EmergencyRoom } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * 근처 응급실과 지금 남은 병상.
 *
 * 의왕시 안에는 응급실이 거의 없다. 시민은 안양·군포·수원·과천·서울 남부로
 * 간다. 그래서 시군구로 자르지 않고, 경기도와 서울 전체를 받아 의왕시청에서
 * 가까운 곳만 남긴다. 시군구 이름(예: "안양시 동안구")에 기대지 않아도 된다.
 *
 * 국립중앙의료원 응급의료정보 조회서비스 (B552657/ErmctInfoInqireService).
 * 활용가이드 V13 기준. 두 오퍼레이션을 hpid(기관 ID) 로 잇는다.
 *   getEgytListInfoInqire            기관 목록 — 좌표·주소·등급. 거의 안 바뀐다
 *   getEmrrmRltmUsefulSckbdInfoInqire 실시간 가용병상 — 기관이 수시로 갱신
 */
const BASE = "https://apis.data.go.kr/B552657/ErmctInfoInqireService";

/** 이 안의 응급실만 보여준다. 의왕 어디서든 20분 안팎이면 닿는 거리다 */
const RADIUS_M = 15_000;
/** 화면에 띄울 최대 수 — 가까운 순 */
const MAX_ROOMS = 15;
const REGIONS = ["경기도", "서울특별시"];

const parser = new XMLParser({ ignoreAttributes: true, parseTagValue: false });

type Raw = Record<string, string | undefined>;

function asArray<T>(v: T | T[] | undefined): T[] {
  if (v == null) return [];
  return Array.isArray(v) ? v : [v];
}

async function call(op: string, key: string, params: Record<string, string>): Promise<Raw[]> {
  const qs = new URLSearchParams({ ...params, pageNo: "1", numOfRows: "300" });
  // serviceKey 는 이미 인코딩된 키가 올 수 있어 URLSearchParams 에 넣지 않는다
  const res = await timedFetch(`${BASE}/${op}?serviceKey=${key}&${qs}`, {}, 15_000);
  const text = await res.text();

  if (text.includes("SERVICE_KEY_IS_NOT_REGISTERED")) {
    throw new Error("등록되지 않은 서비스키 — 응급의료정보 조회서비스 활용신청 필요");
  }
  if (text.trimStart().startsWith("{")) parseDataGoKr(text);

  const json = parser.parse(text);
  const header = json?.response?.header;
  if (header?.resultCode && String(header.resultCode) !== "00") {
    throw new Error(`${header.resultCode}: ${header.resultMsg}`);
  }
  return asArray<Raw>(json?.response?.body?.items?.item);
}

function num(v?: string): number | null {
  if (v == null || v.trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function yn(v?: string): boolean | null {
  if (v === "Y") return true;
  if (v === "N" || v === "N1") return false;
  return null;
}

/** "20261103123000" → ISO (KST) */
function kstStamp(v?: string): string | null {
  if (!v || !/^\d{12,14}$/.test(v)) return null;
  const [y, mo, d, h, mi] = [v.slice(0, 4), v.slice(4, 6), v.slice(6, 8), v.slice(8, 10), v.slice(10, 12)];
  const t = Date.parse(`${y}-${mo}-${d}T${h}:${mi}:00+09:00`);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

interface Base {
  id: string;
  name: string;
  level: string;
  address: string;
  phone: string;
  lat: number;
  lng: number;
  distance: number;
}

/** 기관 목록은 하루에 한 번이면 된다 */
const listCache = createTtlCache<Base[]>(6 * 60 * 60_000, 2);
/** 병상은 기관이 몇 분마다 올린다. 그보다 자주 물을 이유가 없다 */
const bedCache = createTtlCache<EmergencyPayload>(60_000, 2);

async function nearbyList(key: string): Promise<Base[]> {
  const hit = listCache.get("list");
  if (hit) return hit;

  const all = (await Promise.all(REGIONS.map((r) => call("getEgytListInfoInqire", key, { Q0: r })))).flat();
  const out: Base[] = [];
  for (const it of all) {
    const lat = num(it.wgs84Lat);
    const lng = num(it.wgs84Lon);
    if (!it.hpid || lat == null || lng == null) continue;
    const distance = Math.round(haversine(UIWANG.center.lat, UIWANG.center.lng, lat, lng));
    if (distance > RADIUS_M) continue;
    out.push({
      id: it.hpid,
      name: it.dutyName ?? "",
      level: it.dutyEmclsName ?? "",
      address: it.dutyAddr ?? "",
      phone: it.dutyTel3 || it.dutyTel1 || "",
      lat,
      lng,
      distance,
    });
  }
  out.sort((a, b) => a.distance - b.distance);
  const near = out.slice(0, MAX_ROOMS);
  if (near.length) listCache.set("list", near);
  return near;
}

const EMPTY: EmergencyPayload = { rooms: [], source: "nmc", updatedAt: "" };

export async function GET() {
  const key = process.env.EMERGENCY_SERVICE_KEY ?? process.env.KMA_SERVICE_KEY;
  if (!key) return fail(EMPTY, "응급의료 인증키가 설정되지 않았습니다.");

  const cached = bedCache.get("beds");
  if (cached) return ok(cached, undefined, 60);

  let base: Base[];
  try {
    base = await nearbyList(key);
  } catch (e) {
    console.error("[emergency:list]", e);
    return fail(EMPTY, `응급실 목록 조회 실패 — ${e instanceof Error ? e.message : e}`);
  }
  if (!base.length) return fail(EMPTY, "근처 응급실을 찾지 못했습니다.");

  /*
   * 병상 조회가 실패해도 목록은 보여준다. 어디에 응급실이 있고 전화번호가
   * 무엇인지만으로도 급할 때 쓸모가 있다. 병상 칸만 비우고 이유를 적는다.
   */
  let beds = new Map<string, Raw>();
  let notice: string | undefined;
  try {
    const rows = (
      await Promise.all(
        REGIONS.map((r) => call("getEmrrmRltmUsefulSckbdInfoInqire", key, { STAGE1: r })),
      )
    ).flat();
    beds = new Map(rows.filter((r) => r.hpid).map((r) => [r.hpid!, r]));
  } catch (e) {
    console.error("[emergency:beds]", e);
    notice = `실시간 병상 조회 실패 — ${e instanceof Error ? e.message : e}`;
  }

  const rooms: EmergencyRoom[] = base.map((b) => {
    const r = beds.get(b.id);
    return {
      ...b,
      phone: r?.dutyTel3 || b.phone,
      beds: num(r?.hvec),
      totalBeds: num(r?.hvs01),
      ct: yn(r?.hvctayn),
      mri: yn(r?.hvmriayn),
      ventilator: yn(r?.hvventiayn),
      reportedAt: kstStamp(r?.hvidate),
    };
  });

  const payload: EmergencyPayload = { rooms, source: "nmc", updatedAt: nowISO() };
  if (!notice) bedCache.set("beds", payload);
  return ok(payload, notice, 60);
}
