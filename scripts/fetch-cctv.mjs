/**
 * 의왕시 안의 도로 CCTV 목록을 ITS 에서 받아 소스로 굳힌다.
 *   ITS_API_KEY=... node scripts/fetch-cctv.mjs
 *
 * 카메라의 이름·노선·좌표는 바뀌지 않는다. 바뀌는 것은 서명이 붙은
 * 영상 주소뿐이라 그것만 요청 때 받아온다.
 *
 * 이렇게 나눈 이유: openapi.its.go.kr 이 Vercel 에서 이따금 막힌다
 * (UND_ERR_CONNECT_TIMEOUT). 목록까지 매번 거기서 받으면 그때마다
 * 지도에서 카메라가 통째로 사라진다. 영상 서버(cctvsec.ktict.co.kr)는
 * 같은 곳에서 37ms 에 열리므로, 목록만 여기 두면 최소한 어디에 무엇이
 * 있는지는 늘 보인다.
 */
import { writeFileSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const key =
  process.env.ITS_API_KEY ??
  readFileSync(join(root, ".env.local"), "utf8").match(/^ITS_API_KEY="?([^"\n]+)/m)?.[1];
if (!key) throw new Error("ITS_API_KEY 가 없습니다");

const b = readFileSync(join(root, "src/lib/uiwang-boundary.ts"), "utf8");
const ring = [...b.split("UIWANG_BOUNDARY")[1].split("];")[0]
  .matchAll(/\[(-?[\d.]+), (-?[\d.]+)\]/g)].map((m) => [Number(m[1]), Number(m[2])]);
const inside = (lat, lng) => {
  let hit = false;
  for (let i = 0, n = ring.length; i < n; i++) {
    const [y1, x1] = ring[i];
    const [y2, x2] = ring[(i + 1) % n];
    if (y1 > lat !== y2 > lat && lng < ((x2 - x1) * (lat - y1)) / (y2 - y1) + x1) hit = !hit;
  }
  return hit;
};

const bb = readFileSync(join(root, "src/lib/uiwang-boundary.ts"), "utf8")
  .match(/UIWANG_BBOX = \{([^}]+)\}/)[1];
const num = (k) => Number(bb.match(new RegExp(k + ":\\s*(-?[\\d.]+)"))[1]);

function makeId(name, lat, lng) {
  const s = `${name}|${lat.toFixed(5)}|${lng.toFixed(5)}`;
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(36);
}

const res = await fetch(
  `https://openapi.its.go.kr:9443/cctvInfo?apiKey=${key}&type=all&cctvType=3` +
    `&minX=${num("minLng")}&maxX=${num("maxLng")}&minY=${num("minLat")}&maxY=${num("maxLat")}` +
    `&getType=json`,
);
if (!res.ok) throw new Error(`its ${res.status}`);
const data = (await res.json())?.response?.data ?? [];

const cams = [];
for (const c of data) {
  const lat = Number(c.coordy), lng = Number(c.coordx);
  if (!c.cctvname || !Number.isFinite(lat) || !Number.isFinite(lng)) continue;
  if (!inside(lat, lng)) continue;
  const m = c.cctvname.match(/^\[([^\]]+)\]\s*(.*)$/);
  cams.push({
    id: makeId(c.cctvname, lat, lng),
    raw: c.cctvname,
    road: m ? m[1] : "",
    name: m ? m[2] || c.cctvname : c.cctvname,
    lat: Number(lat.toFixed(6)),
    lng: Number(lng.toFixed(6)),
  });
}
if (cams.length === 0) throw new Error("의왕 범위 카메라를 하나도 받지 못했습니다");
cams.sort((a, b) => a.road.localeCompare(b.road, "ko") || a.name.localeCompare(b.name, "ko"));

writeFileSync(
  join(root, "src/lib/uiwang-cctv.ts"),
  `/**
 * 의왕시 도로 CCTV — 국가교통정보센터(ITS).
 *
 * 손으로 고치지 말 것. \`npm run cctv:fetch\` 가 만든다.
 * 이름·노선·좌표는 바뀌지 않으므로 여기 둔다. 서명이 붙은 영상 주소만
 * 요청할 때 받아온다 (src/lib/cctv.ts).
 *
 * 카메라 ${cams.length}대
 */
import type { Cctv } from "./cctvTypes";

/** raw 는 ITS 목록에서 이 카메라를 다시 찾을 때 쓰는 원본 이름이다 */
export const UIWANG_CCTV: (Cctv & { raw: string })[] = [
${cams.map((c) => `  { id: ${JSON.stringify(c.id)}, raw: ${JSON.stringify(c.raw)}, name: ${JSON.stringify(c.name)}, road: ${JSON.stringify(c.road)}, lat: ${c.lat}, lng: ${c.lng} },`).join("\n")}
];
`,
);
console.log(`src/lib/uiwang-cctv.ts — 카메라 ${cams.length}대`);
for (const c of cams) console.log(`  [${c.road}] ${c.name}`);
