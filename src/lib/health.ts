import {
  timedFetch,
  normalizeServiceKey,
  createTtlCache,
  createInFlight,
  kstDateParts,
} from "./fetcher";
import { UIWANG } from "./uiwang";
import { fetchAlerts } from "./alerts";
import { tileSpec } from "./mapShim";
import { resolveOdcloudEndpoint } from "./factoryApi";
import { UIWANG_FACTORIES } from "./uiwang-factories";
import { fetchEvChargers } from "./evChargers";
import { fetchUiwangShelters } from "./shelters";
import { fetchUiwangLibraries } from "./libraries";
import { fetchUiwangSubway } from "./subway";
import { fetchLocalCurrency } from "./localCurrency";

/**
 * 각 외부 API 를 실제로 1회씩 호출해 키 상태를 진단한다.
 * /api/health 와 /status 서버 컴포넌트가 함께 호출해 루프백 HTTP 없이 동작한다.
 */

export interface HealthCheck {
  id: string;
  label: string;
  envVars: string[];
  configured: boolean;
  status: "live" | "fallback" | "error" | "missing";
  detail: string;
  fallback?: string;
  howTo: string;
  latencyMs?: number;
}

export interface HealthReport {
  checks: HealthCheck[];
  summary: { live: number; total: number };
  checkedAt: string;
}

/** 외부 API 쿼터 남용을 막기 위해 45초간 진단 결과를 캐시한다 */
const healthCache = createTtlCache<HealthReport>(45_000, 4);
const healthInFlight = createInFlight<HealthReport>();

async function timed<T>(fn: () => Promise<T>): Promise<[T | null, number, unknown]> {
  const t0 = Date.now();
  try {
    return [await fn(), Date.now() - t0, null];
  } catch (e) {
    return [null, Date.now() - t0, e];
  }
}

function msg(e: unknown) {
  return e instanceof Error ? e.message : String(e);
}

function safeJson(text: string): Record<string, unknown> | null {
  try {
    const v = JSON.parse(text);
    return v && typeof v === "object" ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

async function checkKakaoJs(origin: string): Promise<Partial<HealthCheck>> {
  const key = process.env.NEXT_PUBLIC_KAKAO_JS_KEY;
  if (!key) {
    return {
      status: "fallback",
      detail: "키 없음 — OpenStreetMap 지도로 대신 그리는 중",
      fallback: "OpenStreetMap",
    };
  }

  const [res, latencyMs, err] = await timed(() =>
    timedFetch(`https://dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(key)}&autoload=false`, {
      headers: { Referer: `${origin}/` },
    }),
  );
  if (err) return { status: "error", detail: msg(err), latencyMs };

  const text = await res!.text();
  if (res!.ok && !text.trimStart().startsWith("{")) {
    return { status: "live", detail: `정상 · ${origin} 도메인 허용됨`, latencyMs };
  }
  if (text.includes("domain mismatched")) {
    return {
      status: "error",
      detail: `도메인 미등록 — 카카오 개발자 콘솔 → 앱 설정 → 플랫폼 → Web 에 ${origin} 등록 필요`,
      latencyMs,
    };
  }
  if (text.includes("OPEN_MAP_AND_LOCAL")) {
    return {
      status: "error",
      detail: "카카오맵 제품이 비활성 상태 — 제품 설정 → 카카오맵 → 활성화 ON",
      latencyMs,
    };
  }
  return { status: "error", detail: `HTTP ${res!.status} — ${text.slice(0, 140)}`, latencyMs };
}

async function checkMapTiles(): Promise<Partial<HealthCheck>> {
  const t = tileSpec();
  const url = t.url
    .replace("{s}", t.subdomains ? t.subdomains[0] : "")
    .replace("{z}", "13")
    .replace("{x}", "6985")
    .replace("{y}", "3179")
    .replace("{r}", "");
  const [res, latencyMs, err] = await timed(() => timedFetch(url));
  if (err) return { status: "error", detail: `타일 서버에 닿지 않습니다: ${msg(err)}`, latencyMs };
  const type = res!.headers.get("content-type") ?? "";
  if (!res!.ok || !type.startsWith("image/")) {
    return { status: "error", detail: `HTTP ${res!.status} (${type || "형식 미상"})`, latencyMs };
  }
  return { status: "live", detail: `정상 · ${new URL(url).hostname}`, latencyMs };
}

async function checkKakaoRest(): Promise<Partial<HealthCheck>> {
  const key = process.env.KAKAO_REST_KEY;
  if (!key) {
    return {
      status: "fallback",
      detail: "키 없음 — OpenStreetMap 실제 데이터로 대체 동작 중",
      fallback: "OpenStreetMap (Overpass)",
    };
  }
  const [res, latencyMs, err] = await timed(() =>
    timedFetch(
      `https://dapi.kakao.com/v2/local/search/category.json?category_group_code=CS2&x=${UIWANG.center.lng}&y=${UIWANG.center.lat}&radius=500&size=1`,
      { headers: { Authorization: `KakaoAK ${key}` } },
    ),
  );
  if (err) return { status: "error", detail: msg(err), latencyMs };
  if (!res!.ok) {
    const body = await res!.text();
    if (body.includes("OPEN_MAP_AND_LOCAL")) {
      return {
        status: "error",
        detail:
          "카카오맵 서비스가 앱에서 비활성 상태입니다 — developers.kakao.com → 내 애플리케이션 → 제품 설정 → 카카오맵 → 활성화 ON",
        fallback: "OpenStreetMap (Overpass)",
        latencyMs,
      };
    }
    return { status: "error", detail: `HTTP ${res!.status} — ${body.slice(0, 140)}`, latencyMs };
  }
  const j = safeJson(await res!.text());
  const meta = j?.meta as { total_count?: number } | undefined;
  return {
    status: "live",
    detail: `정상 · 반경 500m 편의점 ${meta?.total_count ?? "?"}건 조회됨`,
    latencyMs,
  };
}

async function checkKma(): Promise<Partial<HealthCheck>> {
  const key = process.env.KMA_SERVICE_KEY;
  if (!key) return { status: "missing", detail: "키 없음 — 날씨가 표시되지 않습니다" };
  const prev = kstDateParts(-3600_000);
  const [res, latencyMs, err] = await timed(() =>
    timedFetch(
      `https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getUltraSrtNcst?serviceKey=${normalizeServiceKey(key)}&dataType=JSON&numOfRows=1&pageNo=1&base_date=${prev.ymd}&base_time=${prev.hh}00&nx=${UIWANG.grid.nx}&ny=${UIWANG.grid.ny}`,
    ),
  );
  if (err) return { status: "error", detail: msg(err), latencyMs };
  const text = await res!.text();
  if (text.trimStart().startsWith("<")) {
    return { status: "error", detail: "XML 오류 응답 (키 무효 가능)", latencyMs };
  }
  const parsed = safeJson(text);
  const h = (parsed?.response as { header?: { resultCode?: string; resultMsg?: string } } | undefined)
    ?.header;
  if (!h) return { status: "error", detail: `예상 밖 응답: ${text.slice(0, 100)}`, latencyMs };
  if (h.resultCode !== "00") {
    return { status: "error", detail: `${h.resultCode}: ${h.resultMsg}`, latencyMs };
  }
  try {
    const alerts = await fetchAlerts();
    return {
      status: "live",
      detail: `정상 · 실황 + 특보 (지금 발효 ${alerts.length}건)`,
      latencyMs,
    };
  } catch (e) {
    return {
      status: "fallback",
      detail: `실황은 정상, 특보 조회 실패: ${msg(e)}`,
      fallback: "특보 없이 동작",
      latencyMs,
    };
  }
}

async function checkNaver(): Promise<Partial<HealthCheck>> {
  const id = process.env.NAVER_CLIENT_ID;
  const secret = process.env.NAVER_CLIENT_SECRET;
  if (!id || !secret) return { status: "missing", detail: "키 없음 — 뉴스가 표시되지 않습니다" };
  const useNcp = secret.length > 20 || id.length === 10;
  const url = useNcp
    ? "https://naverapihub.apigw.ntruss.com/search/v1/news?query=%EC%9D%98%EC%99%95&display=1&format=json"
    : "https://openapi.naver.com/v1/search/news.json?query=%EC%9D%98%EC%99%95&display=1";

  const [res, latencyMs, err] = await timed(() =>
    timedFetch(url, {
      headers: useNcp
        ? { "X-NCP-APIGW-API-KEY-ID": id, "X-NCP-APIGW-API-KEY": secret }
        : { "X-Naver-Client-Id": id, "X-Naver-Client-Secret": secret },
    }),
  );
  if (err) return { status: "error", detail: msg(err), latencyMs };
  if (!res!.ok) {
    const body = (await res!.text()).slice(0, 160);
    return {
      status: "error",
      detail: `HTTP ${res!.status} (${useNcp ? "NCP NAVER API HUB" : "구 개발자센터"}) — ${body}`,
      latencyMs,
    };
  }
  const j = safeJson(await res!.text());
  const total = typeof j?.total === "number" ? j.total.toLocaleString("ko-KR") : String(j?.total ?? "?");
  return {
    status: "live",
    detail: `정상 · ${useNcp ? "NCP NAVER API HUB" : "개발자센터"} · 총 ${total}건 색인됨`,
    latencyMs,
  };
}

async function checkIts(): Promise<Partial<HealthCheck>> {
  const key = process.env.ITS_API_KEY;
  if (!key) return { status: "missing", detail: "키 없음 — 사고·정체가 표시되지 않습니다" };
  const { minX, maxX, minY, maxY } = UIWANG.bbox;
  const [res, latencyMs, err] = await timed(() =>
    timedFetch(
      `https://openapi.its.go.kr:9443/eventInfo?apiKey=${encodeURIComponent(key)}&type=all&eventType=all&minX=${minX}&maxX=${maxX}&minY=${minY}&maxY=${maxY}&getType=json`,
    ),
  );
  if (err) return { status: "error", detail: msg(err), latencyMs };
  if (!res!.ok) return { status: "error", detail: `HTTP ${res!.status}`, latencyMs };
  const text = await res!.text();
  const j = safeJson(text);
  if (!j) return { status: "error", detail: `예상 밖 응답: ${text.slice(0, 120)}`, latencyMs };
  const header = j.header as { resultCode?: string; resultMsg?: string } | undefined;
  const code = header?.resultCode ?? j.resultCode;
  const items = (j.body as { items?: unknown } | undefined)?.items;
  const count = Array.isArray(items) ? items.length : items ? 1 : 0;
  if (code != null && String(code) !== "00" && String(code) !== "0") {
    return { status: "error", detail: `${code}: ${header?.resultMsg ?? ""}`, latencyMs };
  }
  return { status: "live", detail: `정상 · 의왕 범위 돌발 ${count}건`, latencyMs };
}

function gbisGatewayError(text: string): string | null {
  if (!text.trimStart().startsWith("{")) return null;
  const parsed = safeJson(text);
  const h = (
    parsed?.OpenAPI_ServiceResponse as
      | { cmmMsgHeader?: { returnReasonCode?: string; returnAuthMsg?: string; errMsg?: string } }
      | undefined
  )?.cmmMsgHeader;
  if (!h) return null;
  if (h.returnReasonCode === "30") {
    return "30: 등록되지 않은 서비스키 — 이 서비스만 활용신청 미승인 (승인 후 1~2시간 반영)";
  }
  return `${h.returnReasonCode}: ${h.returnAuthMsg ?? h.errMsg}`;
}

async function checkGgStations(): Promise<Partial<HealthCheck>> {
  const key = process.env.GG_DATA_KEY;
  if (!key) return { status: "missing", detail: "경기데이터드림 인증키 미설정" };
  const [res, latencyMs, err] = await timed(() =>
    timedFetch(
      `https://openapi.gg.go.kr/BusStation?KEY=${encodeURIComponent(key)}&Type=json&pIndex=1&pSize=1` +
        `&SIGUN_NM=${encodeURIComponent("의왕시")}`,
      {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/126.0 Safari/537.36",
        },
      },
    ),
  );
  if (err) return { status: "error", detail: msg(err), latencyMs };
  const text = await res!.text();
  if (text.includes("ERROR-")) {
    const m = /"CODE":"(ERROR-[^"]+)","MESSAGE":"([^"]*)"/.exec(text);
    return { status: "error", detail: m ? `${m[1]}: ${m[2]}` : "조회 실패", latencyMs };
  }
  const n = /"list_total_count":(\d+)/.exec(text)?.[1];
  return { status: "live", detail: `정상 · 의왕시 정류소 ${n ?? "?"}곳`, latencyMs };
}

async function checkGbisLocation(): Promise<Partial<HealthCheck>> {
  const key = process.env.GBIS_SERVICE_KEY;
  if (!key) return { status: "missing", detail: "키 없음" };
  const [res, latencyMs, err] = await timed(() =>
    timedFetch(
      "https://apis.data.go.kr/6410000/buslocationservice/v2/getBusLocationListv2" +
        `?serviceKey=${normalizeServiceKey(key)}&routeId=226000032&format=json`,
    ),
  );
  if (err) return { status: "error", detail: msg(err), latencyMs };
  const text = await res!.text();
  const gwErr = gbisGatewayError(text);
  if (gwErr) return { status: "error", detail: gwErr, latencyMs };
  const n = (text.match(/"plateNo"/g) ?? []).length;
  return { status: "live", detail: `정상 · 테스트 노선 운행 ${n}대`, latencyMs };
}

async function checkGbisArrival(): Promise<Partial<HealthCheck>> {
  const key = process.env.GBIS_SERVICE_KEY;
  if (!key) return { status: "missing", detail: "키 없음 — 버스 도착정보가 표시되지 않습니다" };
  const [res, latencyMs, err] = await timed(() =>
    timedFetch(
      `https://apis.data.go.kr/6410000/busarrivalservice/v2/getBusArrivalListv2?serviceKey=${normalizeServiceKey(key)}&stationId=203000129`,
    ),
  );
  if (err) return { status: "error", detail: msg(err), latencyMs };
  const text = await res!.text();
  const gwErr = gbisGatewayError(text);
  if (gwErr) return { status: "error", detail: gwErr, latencyMs };

  let count = 0;
  if (text.trimStart().startsWith("{")) {
    const parsed = safeJson(text);
    const body = (parsed?.response as { msgBody?: { busArrivalList?: unknown } } | undefined)
      ?.msgBody?.busArrivalList;
    count = Array.isArray(body) ? body.length : body ? 1 : 0;
  } else {
    count = (text.match(/<busArrivalList>/g) ?? []).length;
  }
  return { status: "live", detail: `정상 · 테스트 정류소 노선 ${count}건 응답`, latencyMs };
}

async function checkEmergency(): Promise<Partial<HealthCheck>> {
  const key = process.env.EMERGENCY_SERVICE_KEY ?? process.env.KMA_SERVICE_KEY;
  if (!key) return { status: "missing", detail: "키 없음 — 진료중 병원·약국이 비어 있습니다" };
  const [res, latencyMs, err] = await timed(() =>
    timedFetch(
      `https://apis.data.go.kr/B552657/HsptlAsembySearchService/getHsptlMdcncListInfoInqire` +
        `?serviceKey=${normalizeServiceKey(key)}&Q0=${encodeURIComponent("경기도")}` +
        `&Q1=${encodeURIComponent("의왕시")}&pageNo=1&numOfRows=1`,
    ),
  );
  if (err) return { status: "error", detail: msg(err), latencyMs };
  const text = await res!.text();
  if (text.includes("SERVICE_KEY_IS_NOT_REGISTERED")) {
    return {
      status: "error",
      detail: "이 서비스에 활용신청이 안 되어 있습니다 — data.go.kr 에서 신청 필요",
      latencyMs,
    };
  }
  const code = (text.match(/<resultCode>([^<]+)</) ?? [])[1];
  if (code && code !== "00") {
    const m = (text.match(/<resultMsg>([^<]+)</) ?? [])[1] ?? "";
    return { status: "error", detail: `${code}: ${m}`, latencyMs };
  }
  const total = (text.match(/<totalCount>(\d+)</) ?? [])[1] ?? "?";
  return { status: "live", detail: `정상 · 의왕시 의료기관 ${total}곳`, latencyMs };
}

async function checkEmergencyRoom(): Promise<Partial<HealthCheck>> {
  const key = process.env.EMERGENCY_SERVICE_KEY ?? process.env.KMA_SERVICE_KEY;
  if (!key) return { status: "missing", detail: "키 없음 — 응급실 병상이 표시되지 않습니다" };
  const [res, latencyMs, err] = await timed(() =>
    timedFetch(
      "https://apis.data.go.kr/B552657/ErmctInfoInqireService/getEmrrmRltmUsefulSckbdInfoInqire" +
        `?serviceKey=${normalizeServiceKey(key)}&STAGE1=${encodeURIComponent("경기도")}&pageNo=1&numOfRows=3`,
    ),
  );
  if (err) return { status: "error", detail: msg(err), latencyMs };
  const text = await res!.text();
  if (text.includes("SERVICE_KEY_IS_NOT_REGISTERED")) {
    return {
      status: "error",
      detail: "응급의료정보 조회서비스 활용신청이 안 되어 있습니다 (승인 후 1~2시간 반영)",
      latencyMs,
    };
  }
  const code = (text.match(/<resultCode>([^<]+)</) ?? [])[1];
  if (code && code !== "00") {
    const m = (text.match(/<resultMsg>([^<]+)</) ?? [])[1] ?? "";
    return { status: "error", detail: `${code}: ${m}`, latencyMs };
  }
  const total = (text.match(/<totalCount>(\d+)</) ?? [])[1] ?? "?";
  if (!text.includes("<hvec>")) {
    return {
      status: "error",
      detail: `응답은 오지만 가용병상(hvec) 필드가 없습니다 — 명세 변경 확인 필요 (경기 ${total}곳)`,
      latencyMs,
    };
  }
  return { status: "live", detail: `정상 · 경기도 응급실 ${total}곳 실시간 병상`, latencyMs };
}

async function checkAir(): Promise<Partial<HealthCheck>> {
  const key = process.env.AIRKOREA_SERVICE_KEY ?? process.env.KMA_SERVICE_KEY;
  if (!key) return { status: "missing", detail: "키 없음 — 미세먼지가 표시되지 않습니다" };
  const [res, latencyMs, err] = await timed(() =>
    timedFetch(
      `https://apis.data.go.kr/B552584/ArpltnInforInqireSvc/getMsrstnAcctoRltmMesureDnsty` +
        `?serviceKey=${normalizeServiceKey(key)}&returnType=json&numOfRows=1&pageNo=1&dataTerm=DAILY&ver=1.3` +
        `&stationName=${encodeURIComponent("고천동")}`,
    ),
  );
  if (err) return { status: "error", detail: msg(err), latencyMs };
  const text = await res!.text();
  if (text.includes("SERVICE_KEY_IS_NOT_REGISTERED")) {
    return { status: "error", detail: "활용신청이 안 되어 있습니다", latencyMs };
  }
  const parsed = safeJson(text);
  const h = (parsed?.response as { header?: { resultCode?: string; resultMsg?: string } } | undefined)
    ?.header;
  if (!h) return { status: "error", detail: `예상 밖 응답: ${text.slice(0, 80)}`, latencyMs };
  if (h.resultCode === "00") {
    return { status: "live", detail: "정상 · 고천동 측정소", latencyMs };
  }
  return { status: "error", detail: `${h.resultCode}: ${h.resultMsg}`, latencyMs };
}

async function checkNeis(): Promise<Partial<HealthCheck>> {
  const [res, latencyMs, err] = await timed(() =>
    timedFetch(
      `https://open.neis.go.kr/hub/schoolInfo?Type=json&pIndex=1&pSize=100` +
        `&ATPT_OFCDC_SC_CODE=J10${process.env.NEIS_API_KEY ? `&KEY=${encodeURIComponent(process.env.NEIS_API_KEY)}` : ""}`,
    ),
  );
  if (err) return { status: "error", detail: msg(err), latencyMs };
  const j = safeJson(await res!.text());
  const block = j?.schoolInfo as [unknown, { row?: unknown[] }] | undefined;
  const rows = block?.[1]?.row ?? [];
  if (!block) return { status: "error", detail: "예상 밖 응답", latencyMs };
  if (rows.length <= 5) {
    return {
      status: "fallback",
      detail: `키 없이 동작 중 (요청당 ${rows.length}행) — 학급 수는 표시되지 않습니다`,
      fallback: "인증키 없는 호출",
      latencyMs,
    };
  }
  return { status: "live", detail: `정상 · 한 번에 ${rows.length}행`, latencyMs };
}

async function checkFactories(): Promise<Partial<HealthCheck>> {
  if (UIWANG_FACTORIES.length > 0) {
    return { status: "live", detail: `정상 · 정적 스냅샷 ${UIWANG_FACTORIES.length}곳` };
  }
  const key = process.env.FACTORY_SERVICE_KEY ?? process.env.KMA_SERVICE_KEY;
  if (!key) return { status: "missing", detail: "키 없음 — 제조업 분포가 표시되지 않습니다" };
  const [res, latencyMs, err] = await timed(async () => {
    const { path } = await resolveOdcloudEndpoint();
    return timedFetch(
      `https://api.odcloud.kr/api${path}?page=1&perPage=1&serviceKey=${normalizeServiceKey(key)}`,
    );
  });
  if (err) return { status: "error", detail: msg(err), latencyMs };
  if (!res!.ok) {
    const body = (await res!.text()).slice(0, 140);
    return {
      status: "error",
      detail: `HTTP ${res!.status} — data.go.kr '경기도 의왕시_공장 현황' 활용신청 확인 필요 (${body})`,
      latencyMs,
    };
  }
  const j = safeJson(await res!.text());
  return {
    status: "live",
    detail: `정상 · 공공 API 의왕시 공장 ${j?.totalCount ?? "?"}곳`,
    latencyMs,
  };
}

async function checkEvChargers(): Promise<Partial<HealthCheck>> {
  const key = process.env.EV_CHARGER_SERVICE_KEY || process.env.KMA_SERVICE_KEY;
  if (!key) return { status: "missing", detail: "EV_CHARGER_SERVICE_KEY / KMA_SERVICE_KEY 없음" };
  const t0 = Date.now();
  try {
    const data = await fetchEvChargers(key);
    const avail = data.stations.reduce((n, s) => n + s.available, 0);
    return {
      status: "live",
      detail: `의왕 전기차 충전소 ${data.stations.length}곳 · 충전 가능 ${avail}기`,
      latencyMs: Date.now() - t0,
    };
  } catch (e) {
    return { status: "error", detail: msg(e), latencyMs: Date.now() - t0 };
  }
}

async function checkShelters(): Promise<Partial<HealthCheck>> {
  const safetyKey = process.env.SAFETY_DATA_KEY;
  const moisKey = process.env.SHELTER_SERVICE_KEY || process.env.KMA_SERVICE_KEY;
  if (!safetyKey && !moisKey) {
    return { status: "missing", detail: "SAFETY_DATA_KEY / SHELTER_SERVICE_KEY 없음" };
  }
  const t0 = Date.now();
  try {
    const data = await fetchUiwangShelters({ safetyKey, moisKey });
    return {
      status: "live",
      detail: `의왕 쉼터 ${data.shelters.length}곳 (${data.source})`,
      latencyMs: Date.now() - t0,
    };
  } catch (e) {
    return { status: "error", detail: msg(e), latencyMs: Date.now() - t0 };
  }
}

async function checkLibraries(): Promise<Partial<HealthCheck>> {
  const ggKey = process.env.GG_DATA_KEY;
  const odcloudKey = process.env.LIBRARY_SERVICE_KEY || process.env.KMA_SERVICE_KEY;
  if (!ggKey && !odcloudKey) {
    return { status: "missing", detail: "GG_DATA_KEY / LIBRARY_SERVICE_KEY 없음" };
  }
  const t0 = Date.now();
  try {
    const data = await fetchUiwangLibraries({ ggKey, odcloudKey });
    return {
      status: "live",
      detail: `의왕 공공도서관 ${data.libraries.length}곳 (${data.source})`,
      latencyMs: Date.now() - t0,
    };
  } catch (e) {
    return { status: "error", detail: msg(e), latencyMs: Date.now() - t0 };
  }
}

async function checkSubway(): Promise<Partial<HealthCheck>> {
  const key = process.env.SEOUL_SUBWAY_KEY;
  const t0 = Date.now();
  try {
    const data = await fetchUiwangSubway(key);
    const total = data.up.length + data.down.length;
    return {
      status: data.source === "seoul-live" ? "live" : "fallback",
      detail:
        data.source === "seoul-live"
          ? `의왕역 1호선 열차 ${total}편 조회됨`
          : `샘플 키 동작 중 (열차 ${total}편 · SEOUL_SUBWAY_KEY 등록 권장)`,
      fallback: data.source === "seoul-sample" ? "서울 열린데이터광장 sample 키" : undefined,
      latencyMs: Date.now() - t0,
    };
  } catch (e) {
    return { status: "error", detail: msg(e), latencyMs: Date.now() - t0 };
  }
}

async function checkLocalCurrency(): Promise<Partial<HealthCheck>> {
  const ggKey = process.env.GG_DATA_KEY;
  if (!ggKey) return { status: "missing", detail: "GG_DATA_KEY 없음" };
  const t0 = Date.now();
  try {
    const data = await fetchLocalCurrency(ggKey);
    return {
      status: "live",
      detail: `의왕사랑상품권 가맹점 ${data.merchants.length}곳 로드 (전체 ${data.totalCount.toLocaleString("ko-KR")}곳)`,
      latencyMs: Date.now() - t0,
    };
  } catch (e) {
    return { status: "error", detail: msg(e), latencyMs: Date.now() - t0 };
  }
}

interface Spec extends Omit<HealthCheck, "status" | "detail" | "configured"> {
  isConfigured: () => boolean;
}

const SPECS: Spec[] = [
  {
    id: "kakao-js",
    label: "카카오맵 (지도 렌더링)",
    envVars: ["NEXT_PUBLIC_KAKAO_JS_KEY"],
    isConfigured: () => !!process.env.NEXT_PUBLIC_KAKAO_JS_KEY,
    howTo:
      "developers.kakao.com → 앱 키 → JavaScript 키. 플랫폼 > Web 에 도메인 등록 필수. " +
      "안 되면 OpenStreetMap 지도로 대신 그린다",
  },
  {
    id: "map-tiles",
    label: "대체 지도 (OpenStreetMap)",
    envVars: ["NEXT_PUBLIC_MAP_TILES (선택)"],
    isConfigured: () => true,
    howTo: "키가 필요 없습니다. 카카오맵을 못 불러올 때 쓰입니다",
  },
  {
    id: "kakao-rest",
    label: "카카오 로컬 (장소 검색)",
    envVars: ["KAKAO_REST_KEY"],
    isConfigured: () => !!process.env.KAKAO_REST_KEY,
    howTo: "위와 같은 카카오 애플리케이션의 REST API 키",
  },
  {
    id: "emergency",
    label: "응급의료 (진료중 병원·약국)",
    envVars: ["EMERGENCY_SERVICE_KEY", "KMA_SERVICE_KEY"],
    isConfigured: () => !!(process.env.EMERGENCY_SERVICE_KEY ?? process.env.KMA_SERVICE_KEY),
    howTo:
      "data.go.kr → 국립중앙의료원_전국 병·의원 찾기 서비스 + 약국정보 서비스 각각 활용신청. " +
      "키는 기존 것을 그대로 쓴다 (서비스별 신청이 따로 필요할 뿐)",
  },
  {
    id: "emergency-room",
    label: "응급실 실시간 가용병상",
    envVars: ["EMERGENCY_SERVICE_KEY", "KMA_SERVICE_KEY"],
    isConfigured: () => !!(process.env.EMERGENCY_SERVICE_KEY ?? process.env.KMA_SERVICE_KEY),
    howTo: "data.go.kr → 국립중앙의료원_전국 응급의료기관 정보 조회 서비스 활용신청. 키는 기존 것 그대로",
  },
  {
    id: "air",
    label: "에어코리아 (미세먼지)",
    envVars: ["AIRKOREA_SERVICE_KEY", "KMA_SERVICE_KEY"],
    isConfigured: () => !!(process.env.AIRKOREA_SERVICE_KEY ?? process.env.KMA_SERVICE_KEY),
    howTo: "data.go.kr → 한국환경공단_에어코리아_대기오염정보 활용신청",
  },
  {
    id: "neis",
    label: "나이스 (학교 정보·급식)",
    envVars: ["NEIS_API_KEY"],
    isConfigured: () => !!process.env.NEIS_API_KEY,
    howTo: "open.neis.go.kr → 인증키 신청 (즉시 발급). 없어도 동작하지만 요청당 5행 제한",
  },
  {
    id: "factories",
    label: "경기도 의왕시 공장 현황 (ODCloud)",
    envVars: ["FACTORY_SERVICE_KEY", "KMA_SERVICE_KEY"],
    isConfigured: () =>
      UIWANG_FACTORIES.length > 0 || !!(process.env.FACTORY_SERVICE_KEY ?? process.env.KMA_SERVICE_KEY),
    howTo: "data.go.kr → '경기도 의왕시_공장 현황' 오픈API 활용신청 (기존 data.go.kr 키 공유 가능)",
  },
  {
    id: "ev-chargers",
    label: "전기차 충전소 (한국환경공단)",
    envVars: ["EV_CHARGER_SERVICE_KEY", "KMA_SERVICE_KEY"],
    isConfigured: () => !!(process.env.EV_CHARGER_SERVICE_KEY ?? process.env.KMA_SERVICE_KEY),
    howTo: "data.go.kr → '한국환경공단_전기자동차 충전소 정보' 활용신청 (기존 data.go.kr 키 공유 가능)",
  },
  {
    id: "shelters",
    label: "무더위 · 한파 쉼터",
    envVars: ["SAFETY_DATA_KEY", "SHELTER_SERVICE_KEY", "KMA_SERVICE_KEY"],
    isConfigured: () =>
      !!(process.env.SAFETY_DATA_KEY ?? process.env.SHELTER_SERVICE_KEY ?? process.env.KMA_SERVICE_KEY),
    howTo: "safetydata.go.kr(DSSP-IF-10941) 또는 data.go.kr → '행정안전부_무더위쉼터' 활용신청",
  },
  {
    id: "libraries",
    label: "의왕시 공공도서관",
    envVars: ["GG_DATA_KEY", "LIBRARY_SERVICE_KEY", "KMA_SERVICE_KEY"],
    isConfigured: () =>
      !!(process.env.GG_DATA_KEY ?? process.env.LIBRARY_SERVICE_KEY ?? process.env.KMA_SERVICE_KEY),
    howTo: "data.gg.go.kr(PublicLbrry) 또는 data.go.kr → '경기도 의왕시_관내 도서관' 활용신청",
  },
  {
    id: "subway",
    label: "의왕역 1호선 실시간 도착",
    envVars: ["SEOUL_SUBWAY_KEY"],
    isConfigured: () => !!process.env.SEOUL_SUBWAY_KEY,
    howTo: "data.seoul.go.kr → 실시간 지하철 도착정보 인증키 신청 (미설정 시 샘플 키 5건 조회)",
  },
  {
    id: "local-currency",
    label: "의왕사랑상품권 가맹점",
    envVars: ["GG_DATA_KEY"],
    isConfigured: () => !!process.env.GG_DATA_KEY,
    howTo: "data.gg.go.kr → OpenAPI 인증키 (기존 GG_DATA_KEY 재사용 · RegionMnyFacltStus)",
  },
  {
    id: "kma",
    label: "기상청 (날씨·특보)",
    envVars: ["KMA_SERVICE_KEY"],
    isConfigured: () => !!process.env.KMA_SERVICE_KEY,
    howTo: "data.go.kr → 기상청_단기예보 조회서비스 + 기상특보 조회서비스 활용신청",
  },
  {
    id: "naver",
    label: "네이버 검색 (뉴스·시정 소식)",
    envVars: ["NAVER_CLIENT_ID", "NAVER_CLIENT_SECRET"],
    isConfigured: () => !!(process.env.NAVER_CLIENT_ID && process.env.NAVER_CLIENT_SECRET),
    howTo:
      "NCP 콘솔 → Application Service → NAVER API HUB → 검색 이용 신청 후 Application 키 (X-NCP-APIGW-API-KEY-ID / KEY)",
  },
  {
    id: "its",
    label: "ITS 국가교통정보센터 (사고·정체)",
    envVars: ["ITS_API_KEY"],
    isConfigured: () => !!process.env.ITS_API_KEY,
    howTo: "openapi.its.go.kr 회원가입 → 인증키 발급",
  },
  {
    id: "gg-stations",
    label: "정류소 목록 (경기데이터드림)",
    envVars: ["GG_DATA_KEY"],
    isConfigured: () => !!process.env.GG_DATA_KEY,
    howTo: "data.gg.go.kr → OpenAPI 인증키. BusStation 서비스로 stationId·좌표를 얻습니다",
  },
  {
    id: "gbis-arrival",
    label: "버스 도착정보 (경기버스)",
    envVars: ["GBIS_SERVICE_KEY"],
    isConfigured: () => !!process.env.GBIS_SERVICE_KEY,
    howTo: "data.go.kr → '경기도_버스도착정보 조회' 활용신청",
  },
  {
    id: "gbis-location",
    label: "버스 실시간 위치 (경기버스)",
    envVars: ["GBIS_SERVICE_KEY"],
    isConfigured: () => !!process.env.GBIS_SERVICE_KEY,
    howTo: "data.go.kr → '경기도_버스위치정보 조회' 활용신청",
  },
];

export function resolvePublicOrigin(headersLike: Headers, fallbackUrl?: string): string {
  const configured = process.env.PUBLIC_URL;
  if (configured) return configured.replace(/\/$/, "");
  const host = headersLike.get("x-forwarded-host") ?? headersLike.get("host");
  if (host && /^[a-zA-Z0-9.-]+(:\d+)?$/.test(host)) {
    const protoRaw = headersLike.get("x-forwarded-proto");
    const proto =
      protoRaw === "http" || protoRaw === "https"
        ? protoRaw
        : host.startsWith("localhost") || host.startsWith("127.0.0.1")
          ? "http"
          : "https";
    return `${proto}://${host}`;
  }
  if (fallbackUrl) {
    try {
      return new URL(fallbackUrl).origin;
    } catch {
      /* ignore */
    }
  }
  return "http://localhost:3000";
}

export async function runHealthChecks(origin: string, bypassCache = false): Promise<HealthReport> {
  const key = origin;
  if (!bypassCache) {
    const hit = healthCache.get(key);
    if (hit) return hit;
  }

  return healthInFlight(key, async () => {
    const [
      kakaoJs,
      mapTiles,
      kakaoRest,
      emergency,
      emergencyRoom,
      air,
      neis,
      factories,
      evChargers,
      shelters,
      libraries,
      subway,
      localCurrency,
      kma,
      naver,
      its,
      ggStations,
      gbisArrival,
      gbisLocation,
    ] = await Promise.all([
      checkKakaoJs(origin),
      checkMapTiles(),
      checkKakaoRest(),
      checkEmergency(),
      checkEmergencyRoom(),
      checkAir(),
      checkNeis(),
      checkFactories(),
      checkEvChargers(),
      checkShelters(),
      checkLibraries(),
      checkSubway(),
      checkLocalCurrency(),
      checkKma(),
      checkNaver(),
      checkIts(),
      checkGgStations(),
      checkGbisArrival(),
      checkGbisLocation(),
    ]);

    const results: Record<string, Partial<HealthCheck>> = {
      "kakao-js": kakaoJs,
      "map-tiles": mapTiles,
      "kakao-rest": kakaoRest,
      emergency,
      "emergency-room": emergencyRoom,
      air,
      neis,
      factories,
      "ev-chargers": evChargers,
      shelters,
      libraries,
      subway,
      "local-currency": localCurrency,
      kma,
      naver,
      its,
      "gg-stations": ggStations,
      "gbis-arrival": gbisArrival,
      "gbis-location": gbisLocation,
    };

    const checks: HealthCheck[] = SPECS.map((spec) => ({
      id: spec.id,
      label: spec.label,
      envVars: spec.envVars,
      howTo: spec.howTo,
      configured: spec.isConfigured(),
      status: (results[spec.id]?.status ?? "missing") as HealthCheck["status"],
      detail: results[spec.id]?.detail ?? "",
      fallback: results[spec.id]?.fallback,
      latencyMs: results[spec.id]?.latencyMs,
    }));

    const live = checks.filter((c) => c.status === "live").length;
    const report: HealthReport = {
      checks,
      summary: { live, total: checks.length },
      checkedAt: new Date().toISOString(),
    };
    healthCache.set(key, report);
    return report;
  });
}
