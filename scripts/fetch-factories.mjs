/**
 * 의왕시 등록 공장을 소스로 굳힌다.
 *   npm run factories:fetch                          (공공데이터포털 ODCloud API 자동 수집)
 *   npm run factories:fetch -- <CSV 경로> [--as-of 2025-05-30]
 *
 * 원본: 공공데이터포털 "경기도 의왕시_공장 현황" (15126591)
 *   회사명 · 대표주소 · 업종명 · 종업원수 · 생산품 …
 *
 * 원본에는 좌표가 없다. KAKAO_REST_KEY 로 주소를 좌표로 변환하고,
 * DONG_BOUNDARIES 경계 안에 드는지로 행정동을 판정한다.
 */
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

let envText = "";
try {
  envText = readFileSync(join(root, ".env.local"), "utf8");
} catch {
  /* .env.local 이 없는 곳에서는 환경변수만 본다 */
}
const pickEnv = (k) => process.env[k] ?? envText.match(new RegExp(`^${k}=["']?([^"'\\n]+)`, "m"))?.[1];
const KAKAO_KEY = pickEnv("KAKAO_REST_KEY");
if (!KAKAO_KEY) {
  console.error("KAKAO_REST_KEY 가 없습니다 — 주소를 좌표로 바꾸는 데 필요합니다.");
  process.exit(1);
}

// ── 입력 ───────────────────────────────────────────────
const args = process.argv.slice(2);
const asOfIdx = args.indexOf("--as-of");
let asOf = asOfIdx >= 0 ? args[asOfIdx + 1] : null;
const csvPath = [
  args.find((a, i) => !a.startsWith("--") && (asOfIdx < 0 || i !== asOfIdx + 1)),
  join(root, "data/공장현황_경기의왕시.csv"),
].find((p) => p && existsSync(p));

// ── CSV 파서 ───────────────────────────────────────────
function decode(buf) {
  const utf8 = new TextDecoder("utf-8").decode(buf).replace(/^﻿/, "");
  return utf8.includes("") ? new TextDecoder("euc-kr").decode(buf) : utf8;
}

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

function normalizeServiceKey(key) {
  const t = key.trim();
  return /%[0-9a-fA-F]{2}/.test(t) ? t : encodeURIComponent(t);
}

async function loadFromApi() {
  const key = pickEnv("FACTORY_SERVICE_KEY") ?? pickEnv("KMA_SERVICE_KEY");
  if (!key) {
    console.error(
      "CSV 파일이 없고 FACTORY_SERVICE_KEY / KMA_SERVICE_KEY 도 없습니다.\n" +
        "  방법 1) 공공 API 수집: FACTORY_SERVICE_KEY(또는 KMA_SERVICE_KEY) 설정 후 npm run factories:fetch\n" +
        "  방법 2) CSV 수동 변환: npm run factories:fetch -- ~/Downloads/경기도_의왕시_공장현황.csv",
    );
    process.exit(1);
  }

  let path = "/15126591/v1/uddi:b1b7adc0-0076-4cdc-95a9-b490484f4964";
  let detectedAsOf = "2025-05-30";
  try {
    const oas = await fetch("https://infuser.odcloud.kr/oas/docs?namespace=15126591/v1");
    if (oas.ok) {
      const spec = await oas.json();
      const entries = Object.entries(spec.paths ?? {}).filter(([p]) =>
        p.includes("/15126591/v1/uddi:"),
      );
      if (entries.length > 0) {
        entries.sort((a, b) => {
          const da = a[1]?.get?.summary?.match(/(\d{8})/)?.[1] ?? "";
          const db = b[1]?.get?.summary?.match(/(\d{8})/)?.[1] ?? "";
          return db.localeCompare(da);
        });
        path = entries[0][0];
        const m = entries[0][1]?.get?.summary?.match(/(\d{4})(\d{2})(\d{2})/);
        if (m) detectedAsOf = `${m[1]}-${m[2]}-${m[3]}`;
      }
    }
  } catch (e) {
    console.warn("[oas] 기본 경로 사용:", e.message);
  }
  if (!asOf) asOf = detectedAsOf;

  const encoded = normalizeServiceKey(key);
  const all = [];
  for (let page = 1; page <= 5; page++) {
    const res = await fetch(
      `https://api.odcloud.kr/api${path}?page=${page}&perPage=1000&serviceKey=${encoded}`,
    );
    if (!res.ok) throw new Error(`ODCloud ${res.status}: ${(await res.text()).slice(0, 140)}`);
    const json = await res.json();
    const batch = json.data ?? [];
    all.push(...batch);
    if (batch.length < 1000 || (json.totalCount && all.length >= json.totalCount)) break;
  }
  console.log(`공공 API(${path})에서 ${all.length}행 수신 (기준일 ${asOf})`);

  const pickField = (row, ...patterns) => {
    for (const p of patterns) {
      for (const [k, v] of Object.entries(row)) {
        if (p.test(k) && v != null && String(v).trim() !== "") return String(v).trim();
      }
    }
    return "";
  };
  return all
    .map((r) => ({
      name: pickField(r, /^회사명/, /회사|업체|상호/),
      address: pickField(r, /도로명/, /공장.*주소/, /대표.*주소/, /주소/),
      industry: pickField(r, /업종명/, /업종/),
      employees: pickField(r, /종업원/, /근로자|직원/),
      product: pickField(r, /생산품/, /제품/),
    }))
    .filter((r) => r.name);
}

function loadFromCsv(file) {
  const [header, ...body] = parseCsv(decode(readFileSync(file)));
  const col = (...patterns) => {
    for (const p of patterns) {
      const i = header.findIndex((h) => p.test(h.trim()));
      if (i >= 0) return i;
    }
    return -1;
  };
  const C = {
    name: col(/^(회사명|업체명|기업명|상호)/, /회사|업체|상호/),
    address: col(/공장.*주소/, /대표.*주소/, /도로명.*주소/, /주소/, /소재지/),
    industry: col(/업종명/, /업종/),
    employees: col(/종업원/, /근로자|직원/),
    product: col(/생산품/, /제품/),
    asOf: col(/기준일/),
  };
  const missing = ["name", "address", "industry"].filter((k) => C[k] < 0);
  if (missing.length) {
    console.error(`필요한 열을 찾지 못했습니다: ${missing.join(", ")}`);
    console.error(`이 파일의 열: ${header.join(" | ")}`);
    process.exit(1);
  }
  if (!asOf && C.asOf >= 0) asOf = body.find((r) => r[C.asOf]?.trim())?.[C.asOf].trim() ?? null;
  return body
    .filter((r) => r[C.name]?.trim())
    .map((r) => ({
      name: (r[C.name] ?? "").trim(),
      address: (r[C.address] ?? "").trim(),
      industry: (r[C.industry] ?? "").trim(),
      employees: C.employees >= 0 ? String(r[C.employees] ?? "").trim() : "",
      product: C.product >= 0 ? (r[C.product] ?? "").trim() : "",
    }));
}

const rows = csvPath ? loadFromCsv(csvPath) : await loadFromApi();

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
const dongs = [...dongSrc.matchAll(/"([^"]+동)":\s*\[([\s\S]*?)\]\s*,/g)].map((m) => ({
  name: m[1],
  ring: [...m[2].matchAll(/\[(-?[\d.]+),\s*(-?[\d.]+)\]/g)].map((x) => [Number(x[1]), Number(x[2])]),
}));
if (dongs.length < 6) throw new Error(`동 경계를 ${dongs.length}개만 읽었습니다`);

// ── 주소 → 좌표 (건물 주소 캐시 + 재시도) ───────────────
const clean = (a) =>
  a
    .replace(/\(.*?\)/g, " ")
    .replace(/,.*$/, "")
    .replace(/\s+\d+층.*$/, "")
    .replace(/\s+[A-Za-z가-힣]동\s+\d+.*$/, "")
    .replace(/\s+/g, " ")
    .trim();

const geoCache = new Map();

async function geocode(addr) {
  const full = addr.includes("의왕") ? addr : `경기도 의왕시 ${addr}`;
  const cleaned = clean(full);
  if (geoCache.has(cleaned)) return geoCache.get(cleaned);

  const queries = cleaned !== full ? [cleaned, full] : [full];
  for (const q of queries) {
    for (let attempt = 0; attempt < 3; attempt++) {
      const res = await fetch(
        `https://dapi.kakao.com/v2/local/search/address.json?query=${encodeURIComponent(q)}`,
        { headers: { Authorization: `KakaoAK ${KAKAO_KEY}` } },
      );
      if (res.status === 429 || res.status >= 500) {
        await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
        continue;
      }
      if (!res.ok) throw new Error(`카카오 ${res.status}: ${(await res.text()).slice(0, 120)}`);
      const d = (await res.json()).documents?.[0];
      if (d) {
        const pos = { lat: Number(d.y), lng: Number(d.x) };
        geoCache.set(cleaned, pos);
        return pos;
      }
      break;
    }
  }
  geoCache.set(cleaned, null);
  return null;
}

// ── 변환 ───────────────────────────────────────────────
const out = [];
let noAddr = 0;
let notFound = 0;
let outside = 0;

for (let i = 0; i < rows.length; i += 5) {
  const batch = rows.slice(i, i + 5);
  const got = await Promise.all(
    batch.map(async (r) => {
      if (!r.address) {
        noAddr++;
        return null;
      }
      const pos = await geocode(r.address);
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
      const empRaw = r.employees.replace(/[^\d]/g, "");
      const emp = empRaw !== "" ? Number(empRaw) : null;
      return {
        name: r.name,
        industry: r.industry.split(/[/|\n]/)[0].trim(),
        employees: emp != null && Number.isFinite(emp) ? emp : null,
        product: r.product.slice(0, 40),
        address: r.address,
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
 * 의왕시 등록 공장 — 경기도 의왕시_공장 현황 (공공데이터포털 ODCloud 15126591).
 *
 * 손으로 고치지 말 것. \`npm run factories:fetch\` 가 만든다.
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
