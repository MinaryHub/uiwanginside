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

function parsePoints(file, exportName) {
  const src = readFileSync(join(root, file), "utf8");
  const body = src.split(`export const ${exportName}`)[1].split("];")[0];
  // 필드 순서가 다를 수 있어 name / lat / lng 를 항목 단위로 각각 찾는다
  return [...body.matchAll(/\{[\s\S]*?\}/g)]
    .map((m) => {
      const name = m[0].match(/name:\s*"([^"]+)"/)?.[1];
      const lat = m[0].match(/lat:\s*(-?[\d.]+)/)?.[1];
      const lng = m[0].match(/lng:\s*(-?[\d.]+)/)?.[1];
      return name && lat && lng ? { name, lat: Number(lat), lng: Number(lng) } : null;
    })
    .filter(Boolean);
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
const points = [
  ...parsePoints("src/lib/population.ts", "DONG_POPULATION"),
  ...parsePoints("src/lib/uiwang.ts", "LANDMARKS"),
];
for (const p of points) {
  check(p.name, inside(p.lat, p.lng, ring), `${p.lat}, ${p.lng}`);
}
console.log("\n경계 외부여야 하는 좌표");
for (const p of OUTSIDE) check(p.name, !inside(p.lat, p.lng, ring));

// 인구 데이터 정합성 — 기준월이 섞이면 여기서 걸린다
console.log("\n인구 데이터");
{
  const src = readFileSync(join(root, "src/lib/population.ts"), "utf8");
  const body = src.split("export const DONG_POPULATION")[1].split("];")[0];
  const pops = [...body.matchAll(/population:\s*([\d_]+)/g)].map((m) =>
    Number(m[1].replace(/_/g, "")),
  );
  const areas = [...body.matchAll(/area:\s*([\d.]+)/g)].map((m) => Number(m[1]));
  const total = pops.reduce((a, b) => a + b, 0);
  const areaSum = areas.reduce((a, b) => a + b, 0);

  check(`행정동 6개`, pops.length === 6, `${pops.length}개`);
  check(`인구 전부 양수`, pops.every((p) => p > 0));
  check(
    `합계 ${total.toLocaleString("ko-KR")}명 (15만~18만 범위)`,
    total > 150_000 && total < 180_000,
  );
  check(
    `면적 합 ${areaSum.toFixed(2)}km² ≈ 공식 53.99km²`,
    Math.abs(areaSum - 53.99) < 1.5,
  );
}

console.log(failed === 0 ? "\n전부 통과" : `\n${failed}건 실패`);
process.exit(failed === 0 ? 0 : 1);
