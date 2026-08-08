import { timedFetch, ok, fail, nowISO } from "@/lib/fetcher";
import { UIWANG } from "@/lib/uiwang";
import type {
  TrafficPayload,
  Incident,
  IncidentKind,
  TrafficLink,
} from "@/lib/types";

export const dynamic = "force-dynamic";

/** CDN 캐시 수명(초) — 교통 상황은 짧게 */
const CACHE_SEC = 45;

/** ITS 국가교통정보센터 오픈API */
const ITS = "https://openapi.its.go.kr:9443";

/** ITS eventType/ eventDetailType 문자열 → 내부 분류 */
function classify(type: string): IncidentKind {
  if (/사고|추돌|충돌/.test(type)) return "accident";
  if (/공사|작업/.test(type)) return "construction";
  if (/통제|폐쇄|차단/.test(type)) return "closure";
  if (/기상|결빙|안개|폭설|호우/.test(type)) return "weather";
  return "etc";
}

function speedLevel(speed: number): TrafficLink["level"] {
  if (speed >= 40) return "smooth";
  if (speed >= 20) return "slow";
  return "congested";
}

/** 데이터를 못 가져왔을 때 내보내는 빈 응답.
 * 교통사고를 가짜로 만들어 보여주면 시민을 실제로 잘못 인도한다. */
const EMPTY: TrafficPayload = {
  incidents: [],
  links: [],
  source: "its",
  updatedAt: "",
};

interface ItsEvent {
  linkId?: string;
  type?: string;
  eventType?: string;
  eventDetailType?: string;
  startDate?: string;
  message?: string;
  coordX?: string | number;
  coordY?: string | number;
  roadName?: string;
  roadNo?: string;
}

interface ItsTraffic {
  linkId?: string;
  roadName?: string;
  speed?: string | number;
  startNodeId?: string;
}

export async function GET() {
  const key = process.env.ITS_API_KEY;
  if (!key) {
    return fail(EMPTY, "ITS 인증키가 설정되지 않았습니다.");
  }

  const { minX, maxX, minY, maxY } = UIWANG.bbox;
  const bboxQs = `minX=${minX}&maxX=${maxX}&minY=${minY}&maxY=${maxY}`;

  try {
    const [evRes, tfRes] = await Promise.all([
      timedFetch(`${ITS}/eventInfo?apiKey=${key}&type=all&eventType=all&${bboxQs}&getType=json`),
      timedFetch(`${ITS}/trafficInfo?apiKey=${key}&type=all&${bboxQs}&getType=json`),
    ]);

    const incidents: Incident[] = [];
    if (evRes.ok) {
      const j = await evRes.json();
      const rows: ItsEvent[] = j?.body?.items ?? [];
      for (const [i, r] of rows.entries()) {
        const type = r.eventDetailType || r.eventType || r.type || "돌발상황";
        incidents.push({
          id: `${r.linkId ?? "ev"}-${i}`,
          kind: classify(type),
          type,
          message: r.message ?? type,
          road: r.roadName || r.roadNo || "",
          lat: r.coordY != null ? Number(r.coordY) : null,
          lng: r.coordX != null ? Number(r.coordX) : null,
          startedAt: r.startDate ?? nowISO(),
        });
      }
    }

    const links: TrafficLink[] = [];
    if (tfRes.ok) {
      const j = await tfRes.json();
      const rows: ItsTraffic[] = j?.body?.items ?? [];
      for (const [i, r] of rows.entries()) {
        const speed = Number(r.speed ?? 0);
        if (!Number.isFinite(speed) || speed <= 0) continue;
        links.push({
          id: `${r.linkId ?? "lk"}-${i}`,
          name: r.roadName || r.linkId || "구간",
          speed,
          level: speedLevel(speed),
          lat: null,
          lng: null,
        });
      }
    }

    if (incidents.length === 0 && links.length === 0) {
      return ok(
        { incidents, links, source: "its", updatedAt: nowISO() } satisfies TrafficPayload,
        "현재 의왕시 범위에 보고된 돌발상황이 없습니다.",
        CACHE_SEC,
      );
    }

    // 정체 심한 구간 우선
    links.sort((a, b) => a.speed - b.speed);
    return ok(
      {
        incidents,
        links: links.slice(0, 30),
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
