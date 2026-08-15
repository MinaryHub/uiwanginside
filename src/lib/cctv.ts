import { timedFetch, createTtlCache } from "./fetcher";
import { isInsideUiwang } from "./geo";
import { UIWANG_BBOX } from "./uiwang-boundary";
import type { Cctv } from "./cctvTypes";

/**
 * 의왕시 안의 도로 CCTV.
 *
 * ITS 는 세 가지 형식을 준다 — HLS 실시간, MP4, JPEG 정지영상.
 * 정지영상을 쓴다. 실시간을 보려면 브라우저마다 재생 방식이 갈려
 * hls.js 같은 라이브러리를 얹어야 하는데, 길 상태를 확인하는 목적에는
 * 몇 초마다 갱신되는 사진으로 충분하고 데이터도 훨씬 적게 든다.
 *
 * 영상 주소는 http 로만 열린다 (cctvsec.ktict.co.kr:8090, https 는 연결
 * 실패). https 페이지에서 http 이미지는 브라우저가 막으므로 서버가
 * 중계해야 한다. 그래서 주소를 클라이언트로 내보내지 않고 여기 두고,
 * /api/cctv/image 가 id 로만 찾아 가져온다 — 임의의 주소를 받아 대신
 * 열어주는 통로가 되면 그 자체가 구멍이다.
 */
const ITS = "https://openapi.its.go.kr:9443";

/** 서명이 붙은 주소라 오래 들고 있을 수 없다 */
const TTL_MS = 3 * 60_000;

interface ItsCctv {
  cctvname?: string;
  cctvurl?: string;
  coordx?: number;
  coordy?: number;
}

export interface CctvEntry extends Cctv {
  url: string;
}

/** 이름·좌표가 같으면 늘 같은 id 가 나온다 */
function makeId(name: string, lat: number, lng: number): string {
  const s = `${name}|${lat.toFixed(5)}|${lng.toFixed(5)}`;
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

/** "[영동선] 부곡" → { road: "영동선", name: "부곡" } */
function split(raw: string): { road: string; name: string } {
  const m = raw.match(/^\[([^\]]+)\]\s*(.*)$/);
  return m ? { road: m[1], name: m[2] || raw } : { road: "", name: raw };
}

const cache = createTtlCache<CctvEntry[]>(TTL_MS);

export async function fetchCctv(): Promise<CctvEntry[]> {
  const cached = cache.get("cctv");
  if (cached) return cached;

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
  const out: CctvEntry[] = [];
  for (const c of json.response?.data ?? []) {
    const lat = Number(c.coordy);
    const lng = Number(c.coordx);
    if (!c.cctvname || !c.cctvurl || !Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    // 사각형으로 받았으니 실제 경계로 거른다 (범위 112대 → 의왕 15대)
    if (!isInsideUiwang(lat, lng)) continue;
    const { road, name } = split(c.cctvname);
    out.push({ id: makeId(c.cctvname, lat, lng), name, road, lat, lng, url: c.cctvurl });
  }
  if (out.length > 0) cache.set("cctv", out);
  return out;
}
