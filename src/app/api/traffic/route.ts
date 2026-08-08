import { timedFetch, ok, fail, nowISO } from "@/lib/fetcher";
import { UIWANG } from "@/lib/uiwang";
import type {
  TrafficPayload,
  Incident,
  IncidentKind,
  TrafficLink,
} from "@/lib/types";

export const dynamic = "force-dynamic";

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

function sampleTraffic(): TrafficPayload {
  return {
    incidents: [
      {
        id: "s1",
        kind: "accident",
        type: "교통사고",
        message: "영동고속도로 안산방향 북의왕IC 부근 2차로 차량 접촉사고, 서행",
        road: "영동고속도로",
        lat: 37.3852,
        lng: 126.9931,
        startedAt: new Date(Date.now() - 25 * 60_000).toISOString(),
      },
      {
        id: "s2",
        kind: "construction",
        type: "도로공사",
        message: "과천봉담도시고속화도로 의왕 구간 포장보수 공사 (1개 차로 통제)",
        road: "과천봉담도시고속화도로",
        lat: 37.3405,
        lng: 126.9598,
        startedAt: new Date(Date.now() - 4 * 3600_000).toISOString(),
      },
    ],
    links: [
      { id: "l1", name: "1번국도 고천사거리→오전동", speed: 18, level: "congested", lat: 37.3466, lng: 126.9701 },
      { id: "l2", name: "봉담과천로 의왕TG 부근", speed: 32, level: "slow", lat: 37.3374, lng: 126.9612 },
      { id: "l3", name: "백운호수로 내손동 방면", speed: 47, level: "smooth", lat: 37.3745, lng: 126.9903 },
      { id: "l4", name: "학의천로 청계동 방면", speed: 55, level: "smooth", lat: 37.3931, lng: 126.9958 },
    ],
    source: "sample",
    updatedAt: nowISO(),
  };
}

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
    return fail(sampleTraffic(), "ITS_API_KEY 미설정 — 샘플 교통정보를 표시합니다.");
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
      );
    }

    // 정체 심한 구간 우선
    links.sort((a, b) => a.speed - b.speed);
    return ok({
      incidents,
      links: links.slice(0, 30),
      source: "its",
      updatedAt: nowISO(),
    } satisfies TrafficPayload);
  } catch (e) {
    console.error("[traffic]", e);
    return fail(sampleTraffic(), "ITS API 호출 실패 — 샘플 교통정보를 표시합니다.");
  }
}
