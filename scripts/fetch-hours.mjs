/**
 * 의왕시 안에서 영업시간이 적힌 곳을 OpenStreetMap 에서 받아 굳힌다.
 *   node scripts/fetch-hours.mjs
 *
 * 한국에는 개별 가게 영업시간을 주는 공식 오픈 API 가 없다. OSM 에는
 * 자원봉사자가 적어둔 것이 있는데, 의왕 경계상자 안에 146곳이다.
 * 전체 가게 수에 비하면 적지만 지어낼 수는 없으니 있는 것만 쓴다.
 *
 * 요청 때마다 Overpass 를 부르지 않는 이유: 느리고(2~10초) 자주 죽는다.
 * 실제로 이 자료를 받는 동안 overpass-api.de 가 timeout 을 냈다.
 * 영업시간은 자주 바뀌지 않으니 도로·CCTV 처럼 저장소에 둔다.
 */
import { writeFileSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

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

const bb = b.match(/UIWANG_BBOX = \{([^}]+)\}/)[1];
const num = (k) => Number(bb.match(new RegExp(k + ":\\s*(-?[\\d.]+)"))[1]);
const box = `${num("minLat")},${num("minLng")},${num("maxLat")},${num("maxLng")}`;

const QUERY =
  `[out:json][timeout:90];(node(${box})["opening_hours"]["name"];` +
  `way(${box})["opening_hours"]["name"];);out tags center;`;

/** overpass-api.de 는 자주 바쁘다. 미러를 돌아가며 시도한다. */
const MIRRORS = [
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass-api.de/api/interpreter",
];

let elements = null;
for (const url of MIRRORS) {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "uiwang-inside/1.0",
      },
      body: `data=${encodeURIComponent(QUERY)}`,
    });
    if (!res.ok) continue;
    const j = await res.json();
    if (j.elements) { elements = j.elements; console.log(`받음: ${url}`); break; }
  } catch { /* 다음 미러 */ }
}
if (!elements) throw new Error("Overpass 미러가 모두 응답하지 않습니다");

const out = [];
for (const e of elements) {
  const lat = e.lat ?? e.center?.lat;
  const lng = e.lon ?? e.center?.lon;
  const name = e.tags?.name?.trim();
  const hours = e.tags?.opening_hours?.trim();
  if (!name || !hours || !Number.isFinite(lat) || !Number.isFinite(lng)) continue;
  if (!inside(lat, lng)) continue;
  out.push({ name, hours, lat: Number(lat.toFixed(6)), lng: Number(lng.toFixed(6)) });
}
out.sort((a, b) => a.name.localeCompare(b.name, "ko"));

writeFileSync(
  join(root, "src/lib/uiwang-hours.ts"),
  `/**
 * 의왕시 안에서 영업시간이 적힌 곳 — OpenStreetMap
 * (© OpenStreetMap contributors, ODbL).
 *
 * 손으로 고치지 말 것. \`npm run hours:fetch\` 가 만든다.
 * 한국에는 개별 가게 영업시간을 주는 공식 오픈 API 가 없어, 자원봉사자가
 * 적어둔 것을 쓴다. 전체 가게 수에 비하면 적다 — 없는 곳이 훨씬 많다.
 *
 * ${out.length}곳
 */
export interface OsmHours {
  name: string;
  /** OSM opening_hours 원문. 표준 문법("Mo-Fr 09:00-18:00")과 자유 문장이 섞여 있다. */
  hours: string;
  lat: number;
  lng: number;
}

export const UIWANG_HOURS: OsmHours[] = [
${out.map((o) => `  { name: ${JSON.stringify(o.name)}, hours: ${JSON.stringify(o.hours)}, lat: ${o.lat}, lng: ${o.lng} },`).join("\n")}
];
`,
);
console.log(`src/lib/uiwang-hours.ts — ${out.length}곳 (경계 안)`);
