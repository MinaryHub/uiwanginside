import { XMLParser } from "fast-xml-parser";
import {
  timedFetch,
  ok,
  fail,
  nowISO,
  createTtlCache,
  parseDataGoKr,
  normalizeServiceKey,
  asArray,
} from "@/lib/fetcher";
import { fetchWithSharedCache } from "@/lib/sharedCache";
import { UIWANG } from "@/lib/uiwang";
import { haversine } from "@/lib/geo";
import type { EmergencyPayload, EmergencyRoom } from "@/lib/types";

export const dynamic = "force-dynamic";

const BASE = "https://apis.data.go.kr/B552657/ErmctInfoInqireService";
const RADIUS_M = 15_000;
const MAX_ROOMS = 15;
const REGIONS = ["경기도", "서울특별시"];

const parser = new XMLParser({ ignoreAttributes: true, parseTagValue: false });

type Raw = Record<string, string | undefined>;

async function call(op: string, key: string, params: Record<string, string>): Promise<Raw[]> {
  const qs = new URLSearchParams({ ...params, pageNo: "1", numOfRows: "300" });
  const res = await timedFetch(`${BASE}/${op}?serviceKey=${normalizeServiceKey(key)}&${qs}`, {}, 15_000);
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

const listCache = createTtlCache<Base[]>(6 * 60 * 60_000, 2);

async function nearbyList(key: string): Promise<Base[]> {
  const hit = listCache.get("list");
  if (hit) return hit;

  const settled = await Promise.allSettled(
    REGIONS.map((r) => call("getEgytListInfoInqire", key, { Q0: r })),
  );
  const all = settled.flatMap((s) => (s.status === "fulfilled" ? s.value : []));
  if (all.length === 0) {
    const firstErr = settled.find((s) => s.status === "rejected");
    if (firstErr && firstErr.status === "rejected") throw firstErr.reason;
  }

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
  const allOk = settled.every((s) => s.status === "fulfilled");
  if (near.length) listCache.set("list", near, allOk ? undefined : 10 * 60_000);
  return near;
}

const EMPTY: EmergencyPayload = { rooms: [], source: "nmc", updatedAt: "" };

export async function GET() {
  const key = process.env.EMERGENCY_SERVICE_KEY ?? process.env.KMA_SERVICE_KEY;
  if (!key) return fail(EMPTY, "응급의료 인증키가 설정되지 않았습니다.");

  try {
    const cached = await fetchWithSharedCache<EmergencyPayload>({
      key: "emergency:beds",
      ttlMs: 60_000,
      staleMaxMs: 30 * 60_000,
      failCooldownMs: 45_000,
      fetcher: async () => {
        const base = await nearbyList(key);
        if (!base.length) throw new Error("근처 응급실을 찾지 못했습니다.");

        let beds = new Map<string, Raw>();
        let notice: string | undefined;
        const settled = await Promise.allSettled(
          REGIONS.map((r) => call("getEmrrmRltmUsefulSckbdInfoInqire", key, { STAGE1: r })),
        );
        const rows = settled.flatMap((s) => (s.status === "fulfilled" ? s.value : []));
        if (rows.length > 0) {
          beds = new Map(rows.filter((r) => r.hpid).map((r) => [r.hpid!, r]));
        }
        const rejected = settled.filter((s) => s.status === "rejected");
        if (rejected.length === REGIONS.length) {
          const err = rejected[0].status === "rejected" ? rejected[0].reason : "";
          console.error("[emergency:beds]", err);
          notice = `실시간 병상 조회 실패 — ${err instanceof Error ? err.message : err}`;
        } else if (rejected.length > 0) {
          notice = "일부 지역 실시간 병상 조회가 지연되어 가용 정보만 표시합니다.";
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

        return {
          value: { rooms, source: "nmc", updatedAt: nowISO() },
          notice,
          customTtlMs: notice ? 30_000 : undefined,
        };
      },
    });
    return ok(cached.value, cached.notice, cached.stale || cached.notice ? 30 : 60);
  } catch (e) {
    console.error("[emergency]", e);
    return fail(EMPTY, `응급실 조회 실패 — ${e instanceof Error ? e.message : e}`);
  }
}
