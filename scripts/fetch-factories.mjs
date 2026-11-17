/**
 * 의왕시 등록 공장을 소스로 굳힌다.
 *   npm run factories:fetch -- <내려받은 CSV 경로> [--as-of 2026-06-30]
 *
 * 원본: 공공데이터포털 "경기도 의왕시_공장 현황" (파일데이터, 연 1회 갱신)
 *   회사명 · 대표주소 · 업종명 · 종업원수 · 생산품 …
 *
 * 원본에는 좌표가 없다. 지도에 찍고 어느 동인지 정하려면 좌표가 있어야
 * 해서 주소를 카카오로 바꾼다 (KAKAO_REST_KEY — .env.local 또는 환경변수).
 *
 * 행정동은 주소 글자가 아니라 좌표로 정한다. 의왕의 법정동(이동·삼동·
 * 포일동 …)과 행정동(부곡동·내손2동 …)은 일대일이 아니라 글자로 맞추면
 * 틀린다. DONG_BOUNDARIES 경계 안에 드는지로 판정한다.
 *
 * 열 이름은 해마다 조금씩 바뀌므로 정확한 이름 대신 낱말로 찾는다.
 * 못 찾으면 무엇이 있었는지 보여주고 멈춘다 — 엉뚱한 열을 읽어 그럴듯한
 * 숫자를 만드는 것보다 낫다.
 */
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

// ── 입력 ───────────────────────────────────────────────
const args = process.argv.slice(2);
const asOfIdx = args.indexOf("--as-of");
let asOf = asOfIdx >= 0 ? args[asOfIdx + 1] : null;
const file = [
  // --as-of 다음 값은 날짜다. 경로로 읽지 않는다
  args.find((a, i) => !a.startsWith("--") && (asOfIdx < 0 || i !== asOfIdx + 1)),
  join(root, "data/공장현황_경기의왕시.csv"),
].find((p) => p && existsSync(p));
if (!file) {
  console.error(
    "CSV 를 찾지 못했습니다.\n" +
      "  공공데이터포털에서 '경기도 의왕시_공장 현황' 을 내려받아 경로를 넘기세요:\n" +
      "  npm run factories:fetch -- ~/Downloads/경기도_의왕시_공장현황.csv",
  );
  process.exit(1);
}

let envText = "";
try {
  envText = readFileSync(join(root, ".env.local"), "utf8");
} catch {
  /* 파이처럼 .env.local 이 없는 곳에서는 환경변수만 본다 */
}
const pick = (k) => process.env[k] ?? envText.match(new RegExp(`^${k}="?([^"\\n]+)`, "m"))?.[1];
const KAKAO_KEY = pick("KAKAO_REST_KEY");
if (!KAKAO_KEY) {
  console.error("KAKAO_REST_KEY 가 없습니다 — 주소를 좌표로 바꾸는 데 필요합니다.");
  process.exit(1);
}

// ── CSV ────────────────────────────────────────────────
/** 공공데이터 CSV 는 cp949 로 오는 일이 많다. UTF-8 로 읽어 깨지면 다시 읽는다 */
function decode(buf) {
  const utf8 = new TextDecoder("utf-8").decode(buf).replace(/^﻿/, "");
  return utf8.includes("�") ? new TextDecoder("euc-kr").decode(buf) : utf8;
}

/** 따옴표 안의 쉼표·줄바꿈을 지키는 CSV 파서 */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') q = false;
      else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      if (row.some((c) => c.trim())) rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c.trim())) rows.push(row);
  return rows;
}

const [header, ...body] = parseCsv(decode(readFileSync(file)));
const col = (label, ...patterns) => {
  for (const p of patterns) {
    const i = header.findIndex((h) => p.test(h.trim()));
    if (i >= 0) return i;
  }
  return -1;
};
const C = {
  name: col("회사명", /^(회사명|업체명|기업명|상호)/, /회사|업체|상호/),
  address: col("주소", /공장.*주소/, /대표.*주소/, /도로명.*주소/, /주소/, /소재지/),
  industry: col("업종", /업종명/, /업종/),
  employees: col("종업원", /종업원/, /근로자|직원/),
  product: col("생산품", /생산품/, /제품/),
  asOf: col("기준일", /기준일/),
};
const missing = ["name", "address", "industry"].filter((k) => C[k] < 0);
if (missing.length) {
  console.error(`필요한 열을 찾지 못했습니다: ${missing.join(", ")}`);
  console.error(`이 파일의 열: ${header.join(" | ")}`);
  process.exit(1);
}
console.log(
  `열 → 회사명:${header[C.name]} / 주소:${header[C.address]} / 업종:${header[C.industry]}` +
    ` / 종업원:${C.employees >= 0 ? header[C.employees] : "(없음)"}` +
    ` / 생산품:${C.product >= 0 ? header[C.product] : "(없음)"}`,
);
if (!asOf && C.asOf >= 0) asOf = body.find((r) => r[C.asOf]?.trim())?.[C.asOf].trim() ?? null;

// ── 경계 ───────────────────────────────────────────────
const ringsFrom = (src, marker) =>
  [...src.split(marker)[1].split("];")[0].matchAll(/\[(-?[\d.]+),\s*(-?[\d.]+)\]/g)].map((m) => [
    Number(m[1]),
    Number(m[2]),
  ]);
const inRing = (ring, lat, lng) => {
  let hit = false;
  for (let i = 0, n = ring.length; i < n; i++) {
    const [y1, x1] = ring[i];
    const [y2, x2] = ring[(i + 1) % n];
    if (y1 > lat !== y2 > lat && lng < ((x2 - x1) * (lat - y1)) / (y2 - y1) + x1) hit = !hit;
  }
  return hit;
};
const city = ringsFrom(readFileSync(join(root, "src/lib/uiwang-boundary.ts"), "utf8"), "UIWANG_BOUNDARY");
const dongSrc = readFileSync(join(root, "src/lib/dong-boundaries.ts"), "utf8");
const dongs = [...dongSrc.matchAll(/"([^"]+동)":\s*\[(.*?)\],?\n/g)].map((m) => ({
  name: m[1],
  ring: [...m[2].matchAll(/\[(-?[\d.]+),(-?[\d.]+)\]/g)].map((x) => [Number(x[1]), Number(x[2])]),
}));
if (dongs.length < 6) throw new Error(`동 경계를 ${dongs.length}개만 읽었습니다`);

// ── 주소 → 좌표 ────────────────────────────────────────
/** 괄호·층·호 같은 꼬리를 떼야 카카오가 잘 찾는다 */
const clean = (a) =>
  a
    .replace(/\(.*?\)/g, " ")
    .replace(/,.*$/, "")
    .replace(/\s\d+층.*$/, "")
    .replace(/\s+/g, " ")
    .trim();

async function geocode(addr) {
  for (const q of [addr, clean(addr)]) {
    const res = await fetch(
      `https://dapi.kakao.com/v2/local/search/address.json?query=${encodeURIComponent(q)}`,
      { headers: { Authorization: `KakaoAK ${KAKAO_KEY}` } },
    );
    if (!res.ok) throw new Error(`카카오 ${res.status}: ${(await res.text()).slice(0, 120)}`);
    const d = (await res.json()).documents?.[0];
    if (d) return { lat: Number(d.y), lng: Number(d.x) };
  }
  return null;
}

// ── 변환 ───────────────────────────────────────────────
const out = [];
let noAddr = 0;
let notFound = 0;
let outside = 0;
const rows = body.filter((r) => r[C.name]?.trim());

for (let i = 0; i < rows.length; i += 5) {
  const batch = rows.slice(i, i + 5);
  const got = await Promise.all(
    batch.map(async (r) => {
      const address = (r[C.address] ?? "").trim();
      if (!address) {
        noAddr++;
        return null;
      }
      const pos = await geocode(address.includes("의왕") ? address : `경기도 의왕시 ${address}`);
      if (!pos) {
        notFound++;
        return null;
      }
      if (!inRing(city, pos.lat, pos.lng)) {
        outside++;
        return null;
      }
      const dong = dongs.find((d) => inRing(d.ring, pos.lat, pos.lng))?.name;
      if (!dong) {
        outside++;
        return null;
      }
      const emp = Number(String(r[C.employees] ?? "").replace(/[^\d]/g, ""));
      return {
        name: r[C.name].trim(),
        // 표준산업분류 이름에는 쉼표가 들어간다 ("전자부품, 컴퓨터, …") — 쉼표로 자르지 않는다
        industry: (r[C.industry] ?? "").split(/[/|\n]/)[0].trim(),
        employees: C.employees >= 0 && String(r[C.employees] ?? "").trim() !== "" && Number.isFinite(emp) ? emp : null,
        product: C.product >= 0 ? (r[C.product] ?? "").trim().slice(0, 40) : "",
        address,
        dong,
        lat: Math.round(pos.lat * 1e6) / 1e6,
        lng: Math.round(pos.lng * 1e6) / 1e6,
      };
    }),
  );
  out.push(...got.filter(Boolean));
  process.stdout.write(`\r  ${Math.min(i + 5, rows.length)}/${rows.length}`);
}
console.log();

out.sort((a, b) => a.dong.localeCompare(b.dong, "ko") || a.name.localeCompare(b.name, "ko"));

const lines = out.map((f) => `  ${JSON.stringify(f)},`).join("\n");
writeFileSync(
  join(root, "src/lib/uiwang-factories.ts"),
  `/**
 * 의왕시 등록 공장 — 경기도 의왕시_공장 현황 (공공데이터포털 파일데이터, 연 1회 갱신).
 *
 * 손으로 고치지 말 것. \`npm run factories:fetch -- <내려받은 CSV>\` 가 만든다.
 * 원본에는 좌표가 없어 주소를 카카오로 변환했고, 행정동은 그 좌표가 어느
 * 동 경계 안에 드는지로 정했다.
 *
 * ${out.length}곳 (원본 ${rows.length}행 · 주소 없음 ${noAddr} · 좌표 못 찾음 ${notFound} · 의왕 밖 ${outside})
 */

export interface Factory {
  name: string;
  /** 원본 업종명 (한국표준산업분류). 여럿이면 첫째 */
  industry: string;
  /** 종업원 수. 원본에 없으면 null */
  employees: number | null;
  /** 생산품 */
  product: string;
  address: string;
  /** 행정동 — DONG_BOUNDARIES 이름과 같다 */
  dong: string;
  lat: number;
  lng: number;
}

/** 원본 자료의 기준일. 자료가 없으면 null */
export const FACTORIES_AS_OF: string | null = ${asOf ? JSON.stringify(asOf) : "null"};

export const UIWANG_FACTORIES: Factory[] = [
${lines}
];
`,
);

console.log(
  `${out.length}곳 기록 → src/lib/uiwang-factories.ts` +
    `  (원본 ${rows.length} · 주소 없음 ${noAddr} · 좌표 못 찾음 ${notFound} · 의왕 밖 ${outside})`,
);
if (notFound + noAddr > rows.length * 0.2) {
  console.warn("⚠️  다섯 곳 중 한 곳 넘게 빠졌습니다. 주소 열이 맞는지 확인하세요.");
}
