import { timedFetch } from "@/lib/fetcher";
import { UIWANG } from "@/lib/uiwang";

export const dynamic = "force-dynamic";

/**
 * 각 외부 API 를 실제로 1회씩 호출해 키 상태를 진단한다.
 * 키 발급/활용신청이 반영됐는지 확인하는 용도.
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

async function checkKakaoRest(): Promise<Partial<HealthCheck>> {
  const key = process.env.KAKAO_REST_KEY;
  if (!key)
    return {
      status: "fallback",
      detail: "키 없음 — OpenStreetMap 실제 데이터로 대체 동작 중",
      fallback: "OpenStreetMap (Overpass)",
    };
  const [res, latencyMs, err] = await timed(() =>
    timedFetch(
      `https://dapi.kakao.com/v2/local/search/category.json?category_group_code=CS2&x=${UIWANG.center.lng}&y=${UIWANG.center.lat}&radius=500&size=1`,
      { headers: { Authorization: `KakaoAK ${key}` } },
    ),
  );
  if (err) return { status: "error", detail: msg(err), latencyMs };
  if (!res!.ok) {
    const body = await res!.text();
    return {
      status: "error",
      detail: `HTTP ${res!.status} — ${body.slice(0, 140)}`,
      latencyMs,
    };
  }
  const j = await res!.json();
  return {
    status: "live",
    detail: `정상 · 반경 500m 편의점 ${j.meta?.total_count ?? "?"}건 조회됨`,
    latencyMs,
  };
}

async function checkKma(): Promise<Partial<HealthCheck>> {
  const key = process.env.KMA_SERVICE_KEY;
  if (!key) return { status: "missing", detail: "키 없음 — 샘플 날씨 표시 중" };
  const now = new Date(Date.now() + 9 * 3600_000 - 3600_000);
  const p = (n: number) => String(n).padStart(2, "0");
  const date = `${now.getUTCFullYear()}${p(now.getUTCMonth() + 1)}${p(now.getUTCDate())}`;
  const [res, latencyMs, err] = await timed(() =>
    timedFetch(
      `https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getUltraSrtNcst?serviceKey=${key}&dataType=JSON&numOfRows=1&pageNo=1&base_date=${date}&base_time=${p(now.getUTCHours())}00&nx=${UIWANG.grid.nx}&ny=${UIWANG.grid.ny}`,
    ),
  );
  if (err) return { status: "error", detail: msg(err), latencyMs };
  const text = await res!.text();
  if (text.trimStart().startsWith("<"))
    return { status: "error", detail: "XML 오류 응답 (키 무효 가능)", latencyMs };
  const h = JSON.parse(text)?.response?.header;
  return h?.resultCode === "00"
    ? { status: "live", detail: `정상 · ${h.resultMsg}`, latencyMs }
    : { status: "error", detail: `${h?.resultCode}: ${h?.resultMsg}`, latencyMs };
}

async function checkNaver(): Promise<Partial<HealthCheck>> {
  const id = process.env.NAVER_CLIENT_ID;
  const secret = process.env.NAVER_CLIENT_SECRET;
  if (!id || !secret) return { status: "missing", detail: "키 없음 — 샘플 뉴스 표시 중" };
  const [res, latencyMs, err] = await timed(() =>
    timedFetch("https://openapi.naver.com/v1/search/news.json?query=%EC%9D%98%EC%99%95&display=1", {
      headers: { "X-Naver-Client-Id": id, "X-Naver-Client-Secret": secret },
    }),
  );
  if (err) return { status: "error", detail: msg(err), latencyMs };
  if (res!.status === 401) {
    const hint =
      secret.length !== 10
        ? ` (Client Secret 이 ${secret.length}자입니다 — 네이버 Secret 은 보통 10자)`
        : " (애플리케이션에 '검색' API 가 추가되어 있는지 확인)";
    return { status: "error", detail: `401 인증 실패${hint}`, latencyMs };
  }
  if (!res!.ok)
    return { status: "error", detail: `HTTP ${res!.status}`, latencyMs };
  const j = await res!.json();
  return { status: "live", detail: `정상 · 총 ${j.total}건 색인됨`, latencyMs };
}

async function checkIts(): Promise<Partial<HealthCheck>> {
  const key = process.env.ITS_API_KEY;
  if (!key) return { status: "missing", detail: "키 없음 — 샘플 교통정보 표시 중" };
  const { minX, maxX, minY, maxY } = UIWANG.bbox;
  const [res, latencyMs, err] = await timed(() =>
    timedFetch(
      `https://openapi.its.go.kr:9443/eventInfo?apiKey=${key}&type=all&eventType=all&minX=${minX}&maxX=${maxX}&minY=${minY}&maxY=${maxY}&getType=json`,
    ),
  );
  if (err) return { status: "error", detail: msg(err), latencyMs };
  if (!res!.ok) return { status: "error", detail: `HTTP ${res!.status}`, latencyMs };
  const text = await res!.text();
  try {
    const j = JSON.parse(text);
    const code = j?.header?.resultCode ?? j?.resultCode;
    const count = j?.body?.items?.length ?? 0;
    if (code != null && String(code) !== "00" && String(code) !== "0")
      return { status: "error", detail: `${code}: ${j?.header?.resultMsg ?? ""}`, latencyMs };
    return { status: "live", detail: `정상 · 의왕 범위 돌발 ${count}건`, latencyMs };
  } catch {
    return { status: "error", detail: `예상 밖 응답: ${text.slice(0, 120)}`, latencyMs };
  }
}

/** GBIS 게이트웨이 오류(JSON 봉투)를 공통 해석 */
function gbisGatewayError(text: string): string | null {
  if (!text.trimStart().startsWith("{")) return null;
  const h = JSON.parse(text)?.OpenAPI_ServiceResponse?.cmmMsgHeader;
  if (!h) return null;
  if (h.returnReasonCode === "30")
    return "30: 등록되지 않은 서비스키 — 이 서비스만 활용신청 미승인 (승인 후 1~2시간 반영)";
  return `${h.returnReasonCode}: ${h.returnAuthMsg ?? h.errMsg}`;
}

/** 주변 정류소 조회 — stationId 를 얻는 단계라 도착정보보다 선행되어야 한다 */
async function checkGbisStation(): Promise<Partial<HealthCheck>> {
  const key = process.env.GBIS_SERVICE_KEY;
  if (!key) return { status: "missing", detail: "키 없음 — 샘플 버스정보 표시 중" };
  const [res, latencyMs, err] = await timed(() =>
    timedFetch(
      `https://apis.data.go.kr/6410000/busstationservice/v2/getBusStationAroundListv2?serviceKey=${key}&x=${UIWANG.center.lng}&y=${UIWANG.center.lat}`,
    ),
  );
  if (err) return { status: "error", detail: msg(err), latencyMs };
  const text = await res!.text();
  const gwErr = gbisGatewayError(text);
  if (gwErr)
    return {
      status: "fallback",
      detail: gwErr,
      fallback: "OpenStreetMap 정류소 위치 (도착 시간 없음)",
      latencyMs,
    };
  const count = (text.match(/<busStationAroundList>/g) ?? []).length;
  return { status: "live", detail: `정상 · 시청 주변 정류소 ${count}곳`, latencyMs };
}

/** 도착정보 조회 — 실제 정류소 ID 로 응답 형식까지 확인 */
async function checkGbisArrival(): Promise<Partial<HealthCheck>> {
  const key = process.env.GBIS_SERVICE_KEY;
  if (!key) return { status: "missing", detail: "키 없음 — 샘플 버스정보 표시 중" };
  const [res, latencyMs, err] = await timed(() =>
    timedFetch(
      `https://apis.data.go.kr/6410000/busarrivalservice/v2/getBusArrivalListv2?serviceKey=${key}&stationId=203000129`,
    ),
  );
  if (err) return { status: "error", detail: msg(err), latencyMs };
  const text = await res!.text();
  const gwErr = gbisGatewayError(text);
  if (gwErr) return { status: "error", detail: gwErr, latencyMs };

  // 정상 응답은 JSON 또는 XML 로 올 수 있다
  let count = 0;
  if (text.trimStart().startsWith("{")) {
    const body = JSON.parse(text)?.response?.msgBody?.busArrivalList;
    count = Array.isArray(body) ? body.length : body ? 1 : 0;
  } else {
    count = (text.match(/<busArrivalList>/g) ?? []).length;
  }
  return { status: "live", detail: `정상 · 테스트 정류소 노선 ${count}건 응답`, latencyMs };
}

const SPECS: Omit<HealthCheck, "status" | "detail" | "configured">[] = [
  {
    id: "kakao-js",
    label: "카카오맵 (지도 렌더링)",
    envVars: ["NEXT_PUBLIC_KAKAO_JS_KEY"],
    howTo: "developers.kakao.com → 앱 키 → JavaScript 키. 플랫폼 > Web 에 도메인 등록 필수",
  },
  {
    id: "kakao-rest",
    label: "카카오 로컬 (장소 검색)",
    envVars: ["KAKAO_REST_KEY"],
    howTo: "위와 같은 카카오 애플리케이션의 REST API 키",
  },
  {
    id: "kma",
    label: "기상청 (날씨)",
    envVars: ["KMA_SERVICE_KEY"],
    howTo: "data.go.kr → 기상청_단기예보 조회서비스 → 일반 인증키(Decoding)",
  },
  {
    id: "naver",
    label: "네이버 검색 (뉴스)",
    envVars: ["NAVER_CLIENT_ID", "NAVER_CLIENT_SECRET"],
    howTo: "developers.naver.com → 애플리케이션 등록 → 사용 API 에 '검색' 추가",
  },
  {
    id: "its",
    label: "ITS 국가교통정보센터 (사고·정체)",
    envVars: ["ITS_API_KEY"],
    howTo: "openapi.its.go.kr 회원가입 → 인증키 발급",
  },
  {
    id: "gbis-station",
    label: "경기버스 ① 정류소 조회",
    envVars: ["GBIS_SERVICE_KEY"],
    howTo:
      "data.go.kr → '경기도_버스정류소 조회' 활용신청. 주변 정류소의 stationId 를 얻는 단계라 도착정보만으로는 동작하지 않습니다",
  },
  {
    id: "gbis-arrival",
    label: "경기버스 ② 도착정보 조회",
    envVars: ["GBIS_SERVICE_KEY"],
    howTo: "data.go.kr → '경기도_버스도착정보 조회' 활용신청",
  },
];

export async function GET() {
  const [kakaoRest, kma, naver, its, gbisStation, gbisArrival] = await Promise.all([
    checkKakaoRest(),
    checkKma(),
    checkNaver(),
    checkIts(),
    checkGbisStation(),
    checkGbisArrival(),
  ]);

  const jsKey = process.env.NEXT_PUBLIC_KAKAO_JS_KEY;
  const results: Record<string, Partial<HealthCheck>> = {
    "kakao-js": jsKey
      ? {
          status: "live",
          detail: "키 설정됨 — 실제 렌더링 여부는 브라우저에서 확인 (도메인 등록 필요)",
        }
      : { status: "missing", detail: "키 없음 — 지도가 표시되지 않습니다" },
    "kakao-rest": kakaoRest,
    kma,
    naver,
    its,
    "gbis-station": gbisStation,
    "gbis-arrival": gbisArrival,
  };

  const checks: HealthCheck[] = SPECS.map((spec) => ({
    ...spec,
    configured: spec.envVars.every((v) => !!process.env[v]),
    status: (results[spec.id]?.status ?? "missing") as HealthCheck["status"],
    detail: results[spec.id]?.detail ?? "",
    fallback: results[spec.id]?.fallback,
    latencyMs: results[spec.id]?.latencyMs,
  }));

  const live = checks.filter((c) => c.status === "live").length;

  return Response.json(
    { checks, summary: { live, total: checks.length }, checkedAt: new Date().toISOString() },
    { headers: { "Cache-Control": "no-store" } },
  );
}
