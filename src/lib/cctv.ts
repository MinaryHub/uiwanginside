import { timedFetch } from "./fetcher";
import { UIWANG_BBOX } from "./uiwang-boundary";
import { UIWANG_CCTV } from "./uiwang-cctv";
import { getSql, ensureSchema, hasDb } from "./db";

/**
 * 도로 CCTV 영상 주소 찾기.
 *
 * 카메라가 어디에 무엇이 있는지는 uiwang-cctv.ts 에 굳혀 두었다.
 * 여기서 하는 일은 서명이 붙은 영상 주소를 받아오는 것뿐이다.
 *
 * 나눠 둔 이유가 있다. openapi.its.go.kr 은 Vercel 에서 이따금 통째로
 * 막힌다 (UND_ERR_CONNECT_TIMEOUT, 10초 뒤 실패). 반면 영상 서버
 * cctvsec.ktict.co.kr 은 같은 곳에서 37ms 에 열린다. 그래서
 *
 *   - 목록은 ITS 없이도 늘 나온다 → 카메라가 지도에서 사라지지 않는다
 *   - 주소는 한 번 받아 두면 10분 뒤에도 쓸 수 있다 (실측) → 마지막으로
 *     받아둔 것을 DB 에 남겨, ITS 가 막힌 동안에도 영상이 계속 나온다
 *
 * 인스턴스 메모리가 아니라 DB 에 두는 것은 서버리스라 인스턴스가 자주
 * 갈리기 때문이다. 메모리에만 두면 새 인스턴스마다 다시 막힌 ITS 를
 * 두드리게 된다.
 */
const ITS = "https://openapi.its.go.kr:9443";

/** 이보다 최근에 받은 주소면 다시 받지 않는다 */
const FRESH_MS = 5 * 60_000;
/** 이보다 오래되면 만료됐다고 보고 쓰지 않는다 */
const STALE_MS = 60 * 60_000;

interface ItsCctv {
  cctvname?: string;
  cctvurl?: string;
}

/** 프로세스가 살아 있는 동안의 캐시. DB 왕복을 줄인다. */
const mem = new Map<string, { url: string; at: number }>();

async function refresh(): Promise<Map<string, string>> {
  const key = process.env.ITS_API_KEY;
  if (!key) throw new Error("ITS 인증키가 설정되지 않았습니다.");

  const { minLng, maxLng, minLat, maxLat } = UIWANG_BBOX;
  const res = await timedFetch(
    `${ITS}/cctvInfo?apiKey=${key}&type=all&cctvType=3` +
      `&minX=${minLng}&maxX=${maxLng}&minY=${minLat}&maxY=${maxLat}&getType=json`,
    {},
    12_000,
  );
  if (!res.ok) throw new Error(`its ${res.status}`);

  // 소통정보와 응답 모양이 다르다 — body.items 가 아니라 response.data 다
  const json = (await res.json()) as { response?: { data?: ItsCctv[] } };
  const byRaw = new Map<string, string>();
  for (const c of json.response?.data ?? []) {
    if (c.cctvname && c.cctvurl) byRaw.set(c.cctvname, c.cctvurl);
  }

  const now = Date.now();
  const found = new Map<string, string>();
  for (const cam of UIWANG_CCTV) {
    const url = byRaw.get(cam.raw);
    if (!url) continue;
    found.set(cam.id, url);
    mem.set(cam.id, { url, at: now });
  }
  if (found.size > 0) void save(found);
  return found;
}

async function save(urls: Map<string, string>) {
  if (!hasDb()) return;
  try {
    await ensureSchema();
    const sql = getSql();
    for (const [id, url] of urls) {
      await sql`
        INSERT INTO cctv_urls (id, url, at) VALUES (${id}, ${url}, now())
        ON CONFLICT (id) DO UPDATE SET url = EXCLUDED.url, at = now()
      `;
    }
  } catch (e) {
    // 저장에 실패해도 이번 요청은 이미 주소를 들고 있다
    console.error("[cctv:save]", e);
  }
}

async function fromDb(id: string): Promise<{ url: string; age: number } | null> {
  if (!hasDb()) return null;
  try {
    await ensureSchema();
    const sql = getSql();
    const rows = (await sql`
      SELECT url, at FROM cctv_urls WHERE id = ${id}
    `) as { url: string; at: string }[];
    if (rows.length === 0) return null;
    return { url: rows[0].url, age: Date.now() - new Date(rows[0].at).getTime() };
  } catch (e) {
    console.error("[cctv:load]", e);
    return null;
  }
}

/**
 * ITS 가 막혀 있는 동안은 두드리지 않는다.
 *
 * 막히면 연결 시도가 10.5초를 잡아먹고 실패한다. 그때마다 시도하면
 * 저장해 둔 주소가 멀쩡한데도 영상 한 장에 11~14초가 걸린다 (실측).
 * 한 번 막힌 것을 확인하면 잠시 쉬었다 다시 본다.
 */
const DOWN_MS = 5 * 60_000;
let itsDownUntil = 0;

/**
 * 이 카메라의 지금 영상 주소.
 * 없으면 null — 카드가 "지금은 영상을 받을 수 없습니다" 를 보여준다.
 */
export async function cctvUrl(id: string): Promise<string | null> {
  if (!UIWANG_CCTV.some((c) => c.id === id)) return null;

  const hit = mem.get(id);
  if (hit && Date.now() - hit.at < FRESH_MS) return hit.url;

  // 저장해 둔 것이 충분히 최근이면 ITS 를 부를 이유가 없다
  const saved = await fromDb(id);
  if (saved && saved.age < FRESH_MS) {
    mem.set(id, { url: saved.url, at: Date.now() - saved.age });
    return saved.url;
  }

  if (Date.now() >= itsDownUntil) {
    try {
      const fresh = await refresh();
      const url = fresh.get(id);
      if (url) return url;
    } catch (e) {
      itsDownUntil = Date.now() + DOWN_MS;
      console.error("[cctv:refresh]", e);
    }
  }

  // ITS 가 막혔다. 마지막으로 받아둔 주소로 버틴다.
  if (hit && Date.now() - hit.at < STALE_MS) return hit.url;
  return saved && saved.age < STALE_MS ? saved.url : null;
}
