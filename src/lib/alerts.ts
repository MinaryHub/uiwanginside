import { timedFetch } from "./fetcher";

/**
 * 기상특보 — 호우·폭염·한파·대설 같은 경보와 주의보.
 *
 * 급한 정보인데 여태 없었다. 오늘도 의왕에 폭염주의보가 발표됐는데
 * 화면은 아무 말도 하지 않았다.
 *
 * 조심할 점이 둘 있다.
 *
 * 1) 지점 109 는 서울·경기 전체다. 그대로 띄우면 남의 동네 특보를
 *    우리 것처럼 보여준다 — 실제로 오늘 호우주의보는 이천·여주서부
 *    대상이었다. 특보문 본문(t2)에 시군 이름이 적히므로 의왕이 든
 *    것만 받아들인다.
 *
 * 2) 목록에는 발표와 해제가 함께 온다. 해제된 것을 발효 중인 것처럼
 *    보여주면 안 된다. 특보 종류별로 가장 최근 사건만 보고, 그것이
 *    발표·발효일 때만 살아 있다고 본다.
 */
const KMA = "https://apis.data.go.kr/1360000/WthrWrnInfoService/getWthrWrnMsg";
/** 서울·경기 */
const STN = "109";
/** API 가 허용하는 최대 조회 범위 — 오늘 기준 6일 전까지 */
const DAYS_BACK = 5;

export interface WeatherAlert {
  /** 호우주의보 / 폭염경보 … */
  kind: string;
  /** 경보가 주의보보다 위급하다 */
  level: "warning" | "advisory";
  /** 발표 시각 (ISO) */
  since: string;
}

interface Row {
  t2?: string;
  t3?: string;
  tmFc?: number | string;
}

function ymd(offsetDays = 0): string {
  const t = new Date(Date.now() + offsetDays * 86_400_000);
  const kst = new Date(t.toLocaleString("en-US", { timeZone: "Asia/Seoul" }));
  const p = (n: number) => String(n).padStart(2, "0");
  return `${kst.getFullYear()}${p(kst.getMonth() + 1)}${p(kst.getDate())}`;
}

/** "202608171800" → ISO */
function parseTmFc(v?: number | string): string {
  const s = String(v ?? "");
  if (s.length < 12) return new Date().toISOString();
  const iso =
    `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}` +
    `T${s.slice(8, 10)}:${s.slice(10, 12)}:00+09:00`;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

/**
 * 의왕이 대상인지.
 *
 * "경기도(의왕)" 처럼 이름이 그대로 적히거나, 여러 시군이 나열된 가운데
 * 끼어 있다. 시군을 적지 않고 "경기도 전역" 으로 내는 경우도 받아들인다.
 * 그 밖에는 우리 동네가 아니라고 본다 — 놓치는 것보다 헛경보가 나쁘다.
 */
function coversUiwang(region: string): boolean {
  if (region.includes("의왕")) return true;
  return /경기도\s*\(?\s*전역/.test(region);
}

/** "(1) 폭염주의보 발표 : 경기도(의왕), 서울(서울동남권)" */
const LINE = /(\S*(?:주의보|경보))\s*(발표|발효|해제|대치)\s*:\s*(.+)$/;

export async function fetchAlerts(): Promise<WeatherAlert[]> {
  const key = process.env.KMA_SERVICE_KEY;
  if (!key) throw new Error("기상청 인증키가 없습니다");

  const url =
    `${KMA}?serviceKey=${key}&dataType=JSON&numOfRows=50&pageNo=1` +
    `&stnId=${STN}&fromTmFc=${ymd(-DAYS_BACK)}&toTmFc=${ymd()}`;
  const res = await timedFetch(url, {}, 8000);
  if (!res.ok) throw new Error(`kma ${res.status}`);

  const json = await res.json();
  const header = json?.response?.header;
  if (header?.resultCode !== "00") {
    throw new Error(`${header?.resultCode}: ${header?.resultMsg}`);
  }
  const raw = json?.response?.body?.items?.item;
  const rows: Row[] = Array.isArray(raw) ? raw : raw ? [raw] : [];

  /** 특보 종류별 마지막 사건 */
  const last = new Map<string, { action: string; at: string }>();

  // 오래된 것부터 훑어 뒤에 온 것이 앞을 덮게 한다
  const ordered = rows
    .slice()
    .sort((a, b) => String(a.tmFc ?? "").localeCompare(String(b.tmFc ?? "")));

  for (const r of ordered) {
    const at = parseTmFc(r.tmFc);
    for (const line of String(r.t2 ?? "").split("\n")) {
      const m = line.match(LINE);
      if (!m) continue;
      const [, kind, action, region] = m;
      if (!coversUiwang(region)) continue;
      last.set(kind, { action, at });
    }
  }

  const alerts: WeatherAlert[] = [];
  for (const [kind, ev] of last) {
    // 해제·대치된 것은 지금 발효 중이 아니다
    if (ev.action === "해제" || ev.action === "대치") continue;
    alerts.push({
      kind,
      level: kind.includes("경보") ? "warning" : "advisory",
      since: ev.at,
    });
  }
  // 경보를 주의보보다 앞에
  alerts.sort((a, b) => (a.level === b.level ? 0 : a.level === "warning" ? -1 : 1));
  return alerts;
}
