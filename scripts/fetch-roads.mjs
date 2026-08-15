/**
 * 의왕시 주요도로 형상을 OpenStreetMap 에서 받아 소스로 굳힌다.
 *   node scripts/fetch-roads.mjs
 *
 * 길은 정적 자료다. 행정경계(uiwang-boundary.ts)·동 경계와 같은 성격이라
 * 같은 방식으로 저장소에 둔다. 요청마다 Overpass 를 부르면 /api/traffic 이
 * 10.6초가 걸렸다 — 형상 4초 + ITS 15칸.
 *
 * 길이 새로 나거나 이름이 바뀌면 다시 돌려 커밋한다.
 */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const UIWANG_REL = 2409184;

const QUERY = `[out:json][timeout:120];
rel(${UIWANG_REL});map_to_area->.a;
way(area.a)["highway"~"^(motorway|trunk|primary|secondary|tertiary|motorway_link|trunk_link|primary_link)$"]["name"];
out geom;`;

/** 15m 보다 촘촘한 점은 화면에서 구분되지 않는다 */
function thin(points) {
  if (points.length < 3) return points;
  const out = [points[0]];
  for (const p of points.slice(1, -1)) {
    const q = out[out.length - 1];
    if (Math.hypot((p[1] - q[1]) * 88_000, (p[0] - q[0]) * 111_000) > 15) out.push(p);
  }
  out.push(points[points.length - 1]);
  return out;
}

const res = await fetch("https://overpass-api.de/api/interpreter", {
  method: "POST",
  headers: {
    "Content-Type": "application/x-www-form-urlencoded",
    "User-Agent": "uiwang-inside/1.0",
  },
  body: `data=${encodeURIComponent(QUERY)}`,
});
if (!res.ok) throw new Error(`overpass ${res.status}`);

const { elements } = await res.json();
const ways = [];
for (const el of elements ?? []) {
  const name = el.tags?.name?.trim();
  if (!name || !el.geometry || el.geometry.length < 2) continue;
  ways.push({
    name,
    expressway: /^(motorway|trunk)/.test(el.tags.highway ?? ""),
    path: thin(el.geometry.map((p) => [Number(p.lat.toFixed(5)), Number(p.lon.toFixed(5))])),
  });
}
if (ways.length === 0) throw new Error("도로를 하나도 받지 못했습니다");

const names = [...new Set(ways.map((w) => w.name))].sort();
const body = ways
  .map(
    (w) =>
      `  { name: ${JSON.stringify(w.name)}, expressway: ${w.expressway}, path: [` +
      w.path.map(([a, b]) => `[${a},${b}]`).join(",") +
      `] },`,
  )
  .join("\n");

writeFileSync(
  join(root, "src/lib/uiwang-roads.ts"),
  `/**
 * 의왕시 주요도로 형상 — OpenStreetMap (© OpenStreetMap contributors, ODbL).
 *
 * 손으로 고치지 말 것. \`node scripts/fetch-roads.mjs\` 가 만든다.
 * ITS 소통정보에는 좌표가 없어, 도로명으로 이 형상에 속도를 입혀 그린다.
 *
 * way ${ways.length}개 · 도로명 ${names.length}개 · 좌표 ${ways.reduce((s, w) => s + w.path.length, 0)}점
 */
import type { RoadWay } from "./types";

export const UIWANG_ROADS: RoadWay[] = [
${body}
];

/** 소통정보에서 이웃 도시 도로를 걸러내는 데 쓴다 */
export const UIWANG_ROAD_NAMES: ReadonlySet<string> = new Set(${JSON.stringify(names)});
`,
);

console.log(
  `src/lib/uiwang-roads.ts — way ${ways.length}개 · 도로명 ${names.length}개 · ` +
    `좌표 ${ways.reduce((s, w) => s + w.path.length, 0)}점`,
);
