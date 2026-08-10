import { timedFetch, ok, fail, nowISO } from "@/lib/fetcher";
import { UIWANG } from "@/lib/uiwang";
import type { TrafficPayload, Incident, IncidentKind, TrafficLink } from "@/lib/types";

export const dynamic = "force-dynamic";

/** 돌발상황은 자주 바뀐다 */
const CACHE_SEC = 45;

/** ITS 국가교통정보센터 오픈API */
const ITS = "https://openapi.its.go.kr:9443";

/**
 * 조회 범위.
 * bbox 는 실제로 적용된다(시청 주변 좁은 범위 134건 vs 의왕 전체 4,569건).
 * 다만 사각형이라 인접 시 도로가 섞여 들어온다.
 */
const { minX, maxX, minY, maxY } = UIWANG.bbox;
const BBOX = `minX=${minX}&maxX=${maxX}&minY=${minY}&maxY=${maxY}`;

function classify(eventType: string, detail: string): IncidentKind {
  const t = `${eventType} ${detail}`;
  if (/사고|추돌|충돌/.test(t)) return "accident";
  if (/공사|작업/.test(t)) return "construction";
  if (/통제|폐쇄|차단/.test(t)) return "closure";
  if (/기상|결빙|안개|폭설|호우/.test(t)) return "weather";
  return "etc";
}

function speedLevel(speed: number): TrafficLink["level"] {
  if (speed >= 40) return "smooth";
  if (speed >= 20) return "slow";
  return "congested";
}

/**
 * ITS 는 시각을 "20260810051535" (YYYYMMDDHHmmss, KST) 로 준다.
 * 그대로 new Date() 에 넣으면 Invalid Date 가 되어 "몇 분 전" 이 빈칸이 된다.
 */
function parseItsDate(raw?: string): string {
  if (!raw || raw.length < 14) return nowISO();
  const iso =
    `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}` +
    `T${raw.slice(8, 10)}:${raw.slice(10, 12)}:${raw.slice(12, 14)}+09:00`;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? nowISO() : d.toISOString();
}

interface ItsEvent {
  eventType?: string;
  eventDetailType?: string;
  startDate?: string;
  message?: string;
  coordX?: string | number;
  coordY?: string | number;
  roadName?: string;
  roadNo?: string;
  linkId?: string;
  lanesBlocked?: string | number;
}

interface ItsTraffic {
  linkId?: string;
  roadName?: string;
  speed?: string | number;
}

const EMPTY: TrafficPayload = { incidents: [], links: [], source: "its", updatedAt: "" };

export async function GET() {
  const key = process.env.ITS_API_KEY;
  if (!key) return fail(EMPTY, "ITS 인증키가 설정되지 않았습니다.");

  try {
    const [evRes, tfRes] = await Promise.all([
      timedFetch(
        `${ITS}/eventInfo?apiKey=${key}&type=all&eventType=all&${BBOX}&getType=json`,
        {},
        12_000,
      ),
      timedFetch(
        `${ITS}/trafficInfo?apiKey=${key}&type=all&${BBOX}&getType=json`,
        {},
        15_000,
      ),
    ]);

    const incidents: Incident[] = [];
    if (evRes.ok) {
      const j = await evRes.json();
      const rows: ItsEvent[] = j?.body?.items ?? [];
      for (const [i, r] of rows.entries()) {
        const eventType = r.eventType ?? "";
        const detail = r.eventDetailType ?? "";
        const lanes = Number(r.lanesBlocked);
        incidents.push({
          id: `${r.linkId ?? "ev"}-${i}`,
          kind: classify(eventType, detail),
          // 상세 유형이 더 구체적이다 (공사 → 작업, 기타돌발 → 고장)
          type: detail || eventType || "돌발상황",
          message:
            (r.message ?? detail ?? "") +
            (Number.isFinite(lanes) && lanes > 0 ? ` · ${lanes}개 차로 차단` : ""),
          road: r.roadName || r.roadNo || "",
          lat: r.coordY != null ? Number(r.coordY) : null,
          lng: r.coordX != null ? Number(r.coordX) : null,
          startedAt: parseItsDate(r.startDate),
        });
      }
    }

    /**
     * 소통정보에는 좌표가 없다. linkId 와 도로명뿐이라 지도에 찍을 수 없고,
     * 사각형 bbox 라 인접 시 도로도 섞인다. 목록으로만 보여주고,
     * 이름 없는 구간("-")은 알려줄 게 없으니 버린다.
     */
    const links: TrafficLink[] = [];
    if (tfRes.ok) {
      const j = await tfRes.json();
      const rows: ItsTraffic[] = j?.body?.items ?? [];
      for (const [i, r] of rows.entries()) {
        const speed = Number(r.speed);
        const name = (r.roadName ?? "").trim();
        if (!Number.isFinite(speed) || speed <= 0) continue;
        if (!name || name === "-") continue;
        links.push({
          id: `${r.linkId ?? "lk"}-${i}`,
          name,
          speed: Math.round(speed * 10) / 10,
          level: speedLevel(speed),
          lat: null,
          lng: null,
        });
      }
    }

    // 같은 도로가 수십 개 구간으로 쪼개져 오므로(경수대로 187개) 도로별 최저 속도만 남긴다
    const worstByRoad = new Map<string, TrafficLink>();
    for (const l of links) {
      const cur = worstByRoad.get(l.name);
      if (!cur || l.speed < cur.speed) worstByRoad.set(l.name, l);
    }
    const roadLinks = [...worstByRoad.values()].sort((a, b) => a.speed - b.speed);

    if (incidents.length === 0 && roadLinks.length === 0) {
      return ok(
        {
          incidents,
          links: roadLinks,
          source: "its",
          updatedAt: nowISO(),
        } satisfies TrafficPayload,
        "현재 의왕시 범위에 보고된 돌발상황이 없습니다.",
        CACHE_SEC,
      );
    }

    return ok(
      {
        incidents,
        links: roadLinks.slice(0, 12),
        source: "its",
        updatedAt: nowISO(),
      } satisfies TrafficPayload,
      undefined,
      CACHE_SEC,
    );
  } catch (e) {
    console.error("[traffic]", e);
    return fail(EMPTY, `ITS API 호출 실패: ${e instanceof Error ? e.message : e}`);
  }
}
