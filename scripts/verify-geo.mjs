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

function parseDongRings() {
  const src = readFileSync(join(root, "src/lib/dong-boundaries.ts"), "utf8");
  const body = src.split("DONG_BOUNDARIES")[1];
  const rings = {};
  for (const m of body.matchAll(/"([^"]+)":\s*\[((?:\[[-\d.,]+\],?)+)\]/g)) {
    rings[m[1]] = [...m[2].matchAll(/\[(-?[\d.]+),(-?[\d.]+)\]/g)].map((p) => [
      Number(p[1]),
      Number(p[2]),
    ]);
  }
  return rings;
}

/** 폴리곤 무게중심 — population.ts 와 같은 방식이어야 한다 */
function centroid(ring) {
  let a = 0, cx = 0, cy = 0;
  for (let i = 0; i < ring.length; i++) {
    const [y1, x1] = ring[i];
    const [y2, x2] = ring[(i + 1) % ring.length];
    const cross = x1 * y2 - x2 * y1;
    a += cross;
    cx += (x1 + x2) * cross;
    cy += (y1 + y2) * cross;
  }
  a *= 0.5;
  return { lat: cy / (6 * a), lng: cx / (6 * a) };
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
const dongRings = parseDongRings();
const dongPoints = Object.entries(dongRings).map(([name, r]) => ({
  name,
  ...centroid(r),
}));
const points = [...dongPoints, ...parsePoints("src/lib/uiwang.ts", "LANDMARKS")];
for (const p of points) {
  check(p.name, inside(p.lat, p.lng, ring), `${p.lat}, ${p.lng}`);
}
console.log("\n경계 외부여야 하는 좌표");
for (const p of OUTSIDE) check(p.name, !inside(p.lat, p.lng, ring));

// 동 경계 — 대표점이 자기 동 안에 있고 다른 동에는 없어야 한다
console.log("\n행정동 경계");
{
  const names = Object.keys(dongRings);
  check(`경계 6개`, names.length === 6, `${names.length}개`);

  for (const d of dongPoints) {
    const own = dongRings[d.name];
    const inOwn = inside(d.lat, d.lng, own);
    // 대표점이 다른 동에도 들어가면 경계가 겹치거나 데이터가 잘못된 것
    const alsoIn = names.filter((n) => n !== d.name && inside(d.lat, d.lng, dongRings[n]));
    check(
      `${d.name} (${own.length}점)`,
      inOwn && alsoIn.length === 0,
      inOwn ? (alsoIn.length ? `다른 동에도 포함: ${alsoIn.join(",")}` : "") : "자기 동 밖",
    );
  }

  // 꼭짓점 단위 검사는 의미가 없다. 동 경계는 시 경계와 선을 공유하므로
  // 공유 구간의 꼭짓점은 미세한 수치 차이로 내외 판정이 뒤집힌다.
  // 대신 대표점이 시 경계 안에 있는지만 확인한다.
  const outsideCity = dongPoints.filter((d) => !inside(d.lat, d.lng, ring));
  check(
    `대표점 전부 시 경계 내부`,
    outsideCity.length === 0,
    outsideCity.map((d) => d.name).join(",") || "",
  );

  // population.ts 의 동 이름과 경계 키가 일치해야 한다 (오타로 조용히 빠지는 것 방지)
  const popNames = [
    ...readFileSync(join(root, "src/lib/population.ts"), "utf8").matchAll(
      /name:\s*"([^"]+)"/g,
    ),
  ].map((m) => m[1]);
  const missing = popNames.filter((n) => !names.includes(n));
  check(`인구 데이터의 동 이름과 경계 키 일치`, missing.length === 0, missing.join(","));
}

// 인구 데이터 정합성 — 기준월이 섞이면 여기서 걸린다
console.log("\n인구 데이터");
{
  const src = readFileSync(join(root, "src/lib/population.ts"), "utf8");
  // 인구·면적 원본은 RAW 에 있다 (DONG_POPULATION 은 좌표를 덧붙인 유도값)
  const body = src.split("const RAW")[1].split("];")[0];
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
