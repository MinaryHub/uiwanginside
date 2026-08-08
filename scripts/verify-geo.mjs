/**
 * 행정경계 대비 좌표 검증.
 *   node scripts/verify-geo.mjs
 *
 * uiwang.ts 의 행정동·랜드마크가 실제 의왕시 경계 안에 있는지,
 * 인접 시청이 바깥으로 판정되는지 확인한다.
 * 좌표를 손으로 추가할 때 경계 밖 좌표가 섞이는 것을 막는 용도다.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

/** TS 소스에서 좌표 배열만 뽑아낸다 (빌드 없이 실행하기 위함) */
function parseBoundary() {
  const src = readFileSync(join(root, "src/lib/uiwang-boundary.ts"), "utf8");
  const body = src.split("UIWANG_BOUNDARY")[1].split("];")[0];
  return [...body.matchAll(/\[(-?[\d.]+), (-?[\d.]+)\]/g)].map((m) => [
    Number(m[1]),
    Number(m[2]),
  ]);
}

function parsePoints(exportName) {
  const src = readFileSync(join(root, "src/lib/uiwang.ts"), "utf8");
  const body = src.split(`export const ${exportName}`)[1].split("];")[0];
  return [...body.matchAll(/name:\s*"([^"]+)",\s*lat:\s*(-?[\d.]+),\s*lng:\s*(-?[\d.]+)/g)].map(
    (m) => ({ name: m[1], lat: Number(m[2]), lng: Number(m[3]) }),
  );
}

function inside(lat, lng, poly) {
  let c = false;
  for (let i = 0, n = poly.length; i < n; i++) {
    const [y1, x1] = poly[i];
    const [y2, x2] = poly[(i + 1) % n];
    if (y1 > lat !== y2 > lat && lng < ((x2 - x1) * (lat - y1)) / (y2 - y1) + x1) c = !c;
  }
  return c;
}

const ring = parseBoundary();
const OUTSIDE = [
  { name: "수원시청", lat: 37.2636, lng: 127.0286 },
  { name: "안양시청", lat: 37.3943, lng: 126.9568 },
  { name: "과천시청", lat: 37.4292, lng: 126.9877 },
  { name: "군포시청", lat: 37.3617, lng: 126.9352 },
];

let failed = 0;
const check = (label, ok, detail) => {
  if (!ok) failed++;
  console.log(`  ${ok ? "✓" : "✗"} ${label}${detail ? `  ${detail}` : ""}`);
};

console.log(`경계 꼭짓점 ${ring.length}개\n`);
console.log("경계 내부여야 하는 좌표");
for (const p of [...parsePoints("DONGS"), ...parsePoints("LANDMARKS")]) {
  check(p.name, inside(p.lat, p.lng, ring), `${p.lat}, ${p.lng}`);
}
console.log("\n경계 외부여야 하는 좌표");
for (const p of OUTSIDE) check(p.name, !inside(p.lat, p.lng, ring));

console.log(failed === 0 ? "\n전부 통과" : `\n${failed}건 실패`);
process.exit(failed === 0 ? 0 : 1);
