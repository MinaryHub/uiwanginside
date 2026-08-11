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

/**
 * 지도 SDK 는 Referer 로 등록 도메인을 검사한다.
 * 실제 배포 origin 을 Referer 로 보내 도메인 등록 여부까지 확인한다.
 */
async function checkKakaoJs(origin: string): Promise<Partial<HealthCheck>> {
  const key = process.env.NEXT_PUBLIC_KAKAO_JS_KEY;
  if (!key) return { status: "missing", detail: "키 없음 — 지도가 표시되지 않습니다" };

  const [res, latencyMs, err] = await timed(() =>
    timedFetch(`https://dapi.kakao.com/v2/maps/sdk.js?appkey=${key}&autoload=false`, {
      headers: { Referer: `${origin}/` },
    }),
  );
  if (err) return { status: "error", detail: msg(err), latencyMs };

  const text = await res!.text();
  if (res!.ok && !text.trimStart().startsWith("{"))
    return { status: "live", detail: `정상 · ${origin} 도메인 허용됨`, latencyMs };

  if (text.includes("domain mismatched"))
    return {
      status: "error",
      detail: `도메인 미등록 — 카카오 개발자 콘솔 → 앱 설정 → 플랫폼 → Web 에 ${origin} 등록 필요`,
      latencyMs,
    };
  if (text.includes("OPEN_MAP_AND_LOCAL"))
    return {
      status: "error",
      detail: "카카오맵 제품이 비활성 상태 — 제품 설정 → 카카오맵 → 활성화 ON",
      latencyMs,
    };
  return { status: "error", detail: `HTTP ${res!.status} — ${text.slice(0, 140)}`, latencyMs };
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
    // 키는 유효한데 앱에서 카카오맵 제품이 꺼져 있는 경우가 흔하다.
    // 이 설정은 JS SDK 지도 렌더링에도 함께 영향을 준다.
    if (body.includes("OPEN_MAP_AND_LOCAL")) {
      return {
        status: "error",
        detail:
          "카카오맵 서비스가 앱에서 비활성 상태입니다 — developers.kakao.com → 내 애플리케이션 → 제품 설정 → 카카오맵 → 활성화 ON (지도 렌더링에도 동일하게 필요)",
        fallback: "OpenStreetMap (Overpass)",
        latencyMs,
      };
    }
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
  if (!key) return { status: "missing", detail: "키 없음 — 날씨가 표시되지 않습니다" };
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
  if (!id || !secret) return { status: "missing", detail: "키 없음 — 뉴스가 표시되지 않습니다" };
  // 검색 API 는 NCP NAVER API HUB 로 이전됐다. 키 형태로 어느 쪽인지 판별한다.
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
  const j = await res!.json();
  return {
    status: "live",
    detail: `정상 · ${useNcp ? "NCP NAVER API HUB" : "개발자센터"} · 총 ${j.total?.toLocaleString?.() ?? j.total}건 색인됨`,
    latencyMs,
  };
}

async function checkIts(): Promise<Partial<HealthCheck>> {
  const key = process.env.ITS_API_KEY;
  if (!key) return { status: "missing", detail: "키 없음 — 사고·정체가 표시되지 않습니다" };
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

/**
 * 정류소 목록 — 경기데이터드림 BusStation.
 * GBIS 정류소 조회(data.go.kr)는 승인이 필요해 이쪽으로 우회했다.
 * stationId·좌표·ARS번호를 모두 주므로 기능상 부족함이 없다.
 */
async function checkGgStations(): Promise<Partial<HealthCheck>> {
  const key = process.env.GG_DATA_KEY;
  if (!key) return { status: "missing", detail: "경기데이터드림 인증키 미설정" };
  const [res, latencyMs, err] = await timed(() =>
    timedFetch(
      `https://openapi.gg.go.kr/BusStation?KEY=${key}&Type=json&pIndex=1&pSize=1` +
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

/** 버스 실시간 위치 — 좌표는 없고 stationId 만 주지만 서울 노선까지 다룬다 */
async function checkGbisLocation(): Promise<Partial<HealthCheck>> {
  const key = process.env.GBIS_SERVICE_KEY;
  if (!key) return { status: "missing", detail: "키 없음" };
  const [res, latencyMs, err] = await timed(() =>
    timedFetch(
      "https://apis.data.go.kr/6410000/buslocationservice/v2/getBusLocationListv2" +
        `?serviceKey=${key}&routeId=226000032&format=json`,
    ),
  );
  if (err) return { status: "error", detail: msg(err), latencyMs };
  const text = await res!.text();
  const gwErr = gbisGatewayError(text);
  if (gwErr) return { status: "error", detail: gwErr, latencyMs };
  const n = (text.match(/"plateNo"/g) ?? []).length;
  return { status: "live", detail: `정상 · 테스트 노선 운행 ${n}대`, latencyMs };
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

/**
 * 카카오 로그인 자격 증명 점검.
 *
 * 로그인은 실제로 눌러보기 전까지 깨진 걸 알 수 없고, Auth.js 는 실패를
 * CallbackRouteError 로만 알려 원인을 짚기 어렵다. 그래서 일부러 틀린
 * 인가 코드로 토큰 교환을 시도한다. 코드가 틀렸다고 답하면 자격 증명은
 * 성한 것이고, KOE010(Bad client credentials) 이 오면 키·시크릿 문제다.
 * 틀린 코드로는 아무것도 발급되지 않으므로 부작용이 없다.
 */
async function checkKakaoLogin(origin: string): Promise<Partial<HealthCheck>> {
  const id = process.env.KAKAO_CLIENT_ID;
  const secret = process.env.KAKAO_CLIENT_SECRET;
  if (!id) return { status: "missing", detail: "KAKAO_CLIENT_ID(REST API 키) 없음" };

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: id,
    redirect_uri: `${origin}/api/auth/callback/kakao`,
    code: "health-check-invalid-code",
  });
  if (secret) body.set("client_secret", secret);

  const [res, latencyMs, err] = await timed(() =>
    timedFetch("https://kauth.kakao.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded;charset=utf-8" },
      body,
    }),
  );
  if (err) return { status: "error", detail: msg(err), latencyMs };

  const text = await res!.text();
  const code = (text.match(/"error_code"\s*:\s*"([^"]+)"/) ?? [])[1] ?? "";

  if (code === "KOE010") {
    return {
      status: "error",
      detail: secret
        ? "KOE010 — Client Secret 이 콘솔 값과 다릅니다"
        : "KOE010 — 콘솔에서 Client Secret 활성화가 켜져 있는데 KAKAO_CLIENT_SECRET 이 없습니다",
      latencyMs,
    };
  }
  // 코드가 틀렸다는 답 = 자격 증명은 통과했다는 뜻
  return {
    status: "live",
    detail: `자격 증명 정상 (리다이렉트 URI 는 ${origin}/api/auth/callback/kakao 등록 필요)`,
    latencyMs,
  };
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
    id: "kakao-login",
    label: "카카오 로그인 (회원)",
    envVars: ["KAKAO_CLIENT_ID", "KAKAO_CLIENT_SECRET", "AUTH_SECRET"],
    howTo:
      "제품 설정 → 카카오 로그인 → 보안 → Client Secret 생성 후 활성화 ON. " +
      "리다이렉트 URI 는 JavaScript 키가 아니라 REST API 키 쪽에 등록해야 한다",
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
    howTo:
      "NCP 콘솔 → Application Service → NAVER API HUB → 검색 이용 신청 후 Application 키 (X-NCP-APIGW-API-KEY-ID / KEY)",
  },
  {
    id: "its",
    label: "ITS 국가교통정보센터 (사고·정체)",
    envVars: ["ITS_API_KEY"],
    howTo: "openapi.its.go.kr 회원가입 → 인증키 발급",
  },
  {
    id: "gg-stations",
    label: "정류소 목록 (경기데이터드림)",
    envVars: ["GG_DATA_KEY"],
    howTo: "data.gg.go.kr → OpenAPI 인증키. BusStation 서비스로 stationId·좌표를 얻습니다",
  },
  {
    id: "gbis-arrival",
    label: "버스 도착정보 (경기버스)",
    envVars: ["GBIS_SERVICE_KEY"],
    howTo: "data.go.kr → '경기도_버스도착정보 조회' 활용신청",
  },
  {
    id: "gbis-location",
    label: "버스 실시간 위치 (경기버스)",
    envVars: ["GBIS_SERVICE_KEY"],
    howTo: "data.go.kr → '경기도_버스위치정보 조회' 활용신청",
  },
];

export async function GET(req: Request) {
  const origin = new URL(req.url).origin;

  const [kakaoRest, kma, naver, its, ggStations, gbisArrival, gbisLocation] =
    await Promise.all([
    checkKakaoRest(),
    checkKma(),
    checkNaver(),
    checkIts(),
    checkGgStations(),
    checkGbisArrival(),
    checkGbisLocation(),
  ]);

  const results: Record<string, Partial<HealthCheck>> = {
    "kakao-js": await checkKakaoJs(origin),
    "kakao-rest": kakaoRest,
    "kakao-login": await checkKakaoLogin(origin),
    kma,
    naver,
    its,
    "gg-stations": ggStations,
    "gbis-arrival": gbisArrival,
    "gbis-location": gbisLocation,
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
