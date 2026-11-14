import { timedFetch } from "@/lib/fetcher";
import { UIWANG } from "@/lib/uiwang";
import { fetchAlerts } from "@/lib/alerts";

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
  if (h?.resultCode !== "00") {
    return { status: "error", detail: `${h?.resultCode}: ${h?.resultMsg}`, latencyMs };
  }
  // 특보는 실황과 다른 서비스다. 하나만 되고 다른 하나가 막힐 수 있다.
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
 * 응급의료·미세먼지는 이 화면에 항목이 없어, 망가진 채로 오래 지나갔다.
 * 의료 모드가 통째로 비어 있는데도 아무 데서도 드러나지 않았다.
 * 화면에 쓰는 것은 모두 여기 올린다.
 */
async function checkEmergency(): Promise<Partial<HealthCheck>> {
  const key = process.env.EMERGENCY_SERVICE_KEY ?? process.env.KMA_SERVICE_KEY;
  if (!key) return { status: "missing", detail: "키 없음 — 진료중 병원·약국이 비어 있습니다" };
  const [res, latencyMs, err] = await timed(() =>
    timedFetch(
      `https://apis.data.go.kr/B552657/HsptlAsembySearchService/getHsptlMdcncListInfoInqire` +
        `?serviceKey=${key}&Q0=${encodeURIComponent("경기도")}` +
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

/**
 * 응급실 실시간 가용병상. 병·의원 찾기와는 다른 서비스라 활용신청을 따로
 * 받는다. 응답 필드 이름(hvec 등)까지 살아 있는지 함께 본다 — 이름이 틀리면
 * 화면에 "정보 없음" 만 줄줄이 뜨고 원인은 보이지 않는다.
 */
async function checkEmergencyRoom(): Promise<Partial<HealthCheck>> {
  const key = process.env.EMERGENCY_SERVICE_KEY ?? process.env.KMA_SERVICE_KEY;
  if (!key) return { status: "missing", detail: "키 없음 — 응급실 병상이 표시되지 않습니다" };
  const [res, latencyMs, err] = await timed(() =>
    timedFetch(
      "https://apis.data.go.kr/B552657/ErmctInfoInqireService/getEmrrmRltmUsefulSckbdInfoInqire" +
        `?serviceKey=${key}&STAGE1=${encodeURIComponent("경기도")}&pageNo=1&numOfRows=3`,
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
        `?serviceKey=${key}&returnType=json&numOfRows=1&pageNo=1&dataTerm=DAILY&ver=1.3` +
        `&stationName=${encodeURIComponent("고천동")}`,
    ),
  );
  if (err) return { status: "error", detail: msg(err), latencyMs };
  const text = await res!.text();
  if (text.includes("SERVICE_KEY_IS_NOT_REGISTERED")) {
    return { status: "error", detail: "활용신청이 안 되어 있습니다", latencyMs };
  }
  try {
    const h = JSON.parse(text)?.response?.header;
    if (h?.resultCode === "00") {
      return { status: "live", detail: "정상 · 고천동 측정소", latencyMs };
    }
    // 에어코리아는 "05: 서비스 연결실패" 를 자주 낸다. 셋 중 둘이 실패했다.
    return { status: "error", detail: `${h?.resultCode}: ${h?.resultMsg}`, latencyMs };
  } catch {
    return { status: "error", detail: `예상 밖 응답: ${text.slice(0, 80)}`, latencyMs };
  }
}

async function checkNeis(): Promise<Partial<HealthCheck>> {
  const [res, latencyMs, err] = await timed(() =>
    timedFetch(
      `https://open.neis.go.kr/hub/schoolInfo?Type=json&pIndex=1&pSize=100` +
        `&ATPT_OFCDC_SC_CODE=J10${process.env.NEIS_API_KEY ? `&KEY=${process.env.NEIS_API_KEY}` : ""}`,
    ),
  );
  if (err) return { status: "error", detail: msg(err), latencyMs };
  try {
    const rows = (await res!.json())?.schoolInfo?.[1]?.row ?? [];
    // 키가 없으면 요청당 5행으로 묶인다 — 학급 수를 셀 수 없다
    if (rows.length <= 5) {
      return {
        status: "fallback",
        detail: `키 없이 동작 중 (요청당 ${rows.length}행) — 학급 수는 표시되지 않습니다`,
        fallback: "인증키 없는 호출",
        latencyMs,
      };
    }
    return { status: "live", detail: `정상 · 한 번에 ${rows.length}행`, latencyMs };
  } catch {
    return { status: "error", detail: "예상 밖 응답", latencyMs };
  }
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
    id: "emergency",
    label: "응급의료 (진료중 병원·약국)",
    envVars: ["KMA_SERVICE_KEY"],
    howTo:
      "data.go.kr → 국립중앙의료원_전국 병·의원 찾기 서비스 + 약국정보 서비스 각각 활용신청. " +
      "키는 기존 것을 그대로 쓴다 (서비스별 신청이 따로 필요할 뿐)",
  },
  {
    id: "emergency-room",
    label: "응급실 실시간 가용병상",
    envVars: ["KMA_SERVICE_KEY"],
    howTo: "data.go.kr → 국립중앙의료원_전국 응급의료기관 정보 조회 서비스 활용신청. 키는 기존 것 그대로",
  },
  {
    id: "air",
    label: "에어코리아 (미세먼지)",
    envVars: ["KMA_SERVICE_KEY"],
    howTo: "data.go.kr → 한국환경공단_에어코리아_대기오염정보 활용신청",
  },
  {
    id: "neis",
    label: "나이스 (학교 정보·급식)",
    envVars: ["NEIS_API_KEY"],
    howTo: "open.neis.go.kr → 인증키 신청 (즉시 발급). 없어도 동작하지만 요청당 5행 제한",
  },
  {
    id: "kma",
    label: "기상청 (날씨·특보)",
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

/**
 * 브라우저가 실제로 두드린 주소.
 *
 * `new URL(req.url).origin` 을 그대로 쓰면 안 된다. 리버스 프록시 뒤에서는
 * Next 가 컨테이너 안쪽 주소를 돌려준다 — 파이에서 https://0.0.0.0:3000 이
 * 나왔고, 그 화면이 "이 도메인을 카카오에 등록하세요" 라고 안내했다.
 * 등록할 수 없는 주소이고, 정작 진짜 도메인은 멀쩡한데도 오류로 보였다.
 *
 * 프록시가 붙여 주는 값을 먼저 보고, 없으면 설정된 공개 주소를 쓴다.
 * 진단용이라 헤더를 믿어도 위험하지 않다 — 권한을 주는 데 쓰지 않는다.
 */
function publicOrigin(req: Request): string {
  const h = req.headers;
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (host) {
    const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
    return `${proto}://${host}`;
  }
  // AUTH_URL 은 로그인을 쓰던 시절의 이름이다. 이미 넣어둔 배포를 위해 함께 읽는다.
  const configured = process.env.PUBLIC_URL ?? process.env.AUTH_URL;
  if (configured) return configured.replace(/\/$/, "");
  return new URL(req.url).origin;
}

export async function GET(req: Request) {
  const origin = publicOrigin(req);

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
    emergency: await checkEmergency(),
    "emergency-room": await checkEmergencyRoom(),
    air: await checkAir(),
    neis: await checkNeis(),
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
