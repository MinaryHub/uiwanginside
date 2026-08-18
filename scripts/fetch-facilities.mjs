/**
 * 의왕시 생활편의 시설을 공공데이터에서 받아 소스로 굳힌다.
 *   node scripts/fetch-facilities.mjs
 *
 *   주차장    행정안전부_전국주차장정보표준데이터 (요금·운영시간 포함)
 *   도시공원  행정안전부_전국도시공원표준데이터
 *   화장실    행정안전부_전국공중화장실표준데이터 — 오프라인 CSV
 *
 * 전국 데이터라 요청마다 부르면 2만 건을 훑어야 한다. 시설 위치는 자주
 * 바뀌지 않으니 도로·CCTV 처럼 저장소에 둔다.
 *
 * 화장실 CSV 에는 좌표가 없어 도로명주소를 카카오로 변환한다. 지도에
 * 찍으려면 좌표가 있어야 하고, 주소만으로는 아무것도 못 한다.
 */
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const env = readFileSync(join(root, ".env.local"), "utf8");
const pick = (k) => env.match(new RegExp(`^${k}="?([^"\\n]+)`, "m"))?.[1];
const DATA_KEY = pick("KMA_SERVICE_KEY");
const KAKAO_KEY = pick("KAKAO_REST_KEY");
if (!DATA_KEY) throw new Error("KMA_SERVICE_KEY 가 없습니다");

/* 경계 안인지 판정 — 주소 문자열만 믿으면 이웃 시가 섞인다 */
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

const PAGE = 1000;

/** 표준데이터 한 종류를 끝까지 받아 의왕 것만 남긴다 */
async function collect(service, label) {
  const out = [];
  let total = Infinity;
  for (let page = 1; (page - 1) * PAGE < total; page++) {
    const url =
      `https://api.data.go.kr/openapi/${service}` +
      `?serviceKey=${DATA_KEY}&pageNo=${page}&numOfRows=${PAGE}&type=json`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${label} HTTP ${res.status}`);
    const body = (await res.json()).body;
    total = Number(body.totalCount);
    const items = body.items?.item ?? [];
    if (items.length === 0) break;
    for (const it of items) {
      const lat = Number(it.latitude);
      const lng = Number(it.longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
      if (!inside(lat, lng)) continue;
      out.push({ ...it, latitude: lat, longitude: lng });
    }
    process.stdout.write(`\r  ${label} ${Math.min(page * PAGE, total)}/${total} → 의왕 ${out.length}건`);
  }
  console.log();
  return out;
}

/** 도로명주소 → 좌표 (카카오) */
async function geocode(addr) {
  if (!KAKAO_KEY || !addr) return null;
  const res = await fetch(
    `https://dapi.kakao.com/v2/local/search/address.json?query=${encodeURIComponent(addr)}`,
    { headers: { Authorization: `KakaoAK ${KAKAO_KEY}` } },
  );
  if (!res.ok) return null;
  const d = (await res.json()).documents?.[0];
  return d ? { lat: Number(d.y), lng: Number(d.x) } : null;
}

/** 화장실 CSV — 좌표가 없어 주소를 변환한다 */
async function toilets() {
  const candidates = [
    join(root, "data/공중화장실정보_경기의왕시.csv"),
    "/Users/smic/Downloads/공중화장실정보_경기의왕시.csv",
    "/Users/smic/Downloads/공중화장실정보_경기의왕시 (1).csv",
  ];
  const file = candidates.find((f) => existsSync(f));
  if (!file) {
    console.log("  화장실 CSV 를 찾지 못했습니다 — 건너뜁니다");
    return [];
  }
  // 이 CSV 는 cp949 로 내려온다
  const text = new TextDecoder("euc-kr").decode(readFileSync(file));
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  const head = splitCsv(lines[0]);
  const col = (n) => head.indexOf(n);

  const out = [];
  for (const line of lines.slice(1)) {
    const c = splitCsv(line);
    const name = c[col("화장실명")]?.trim();
    const addr = c[col("소재지도로명주소")]?.trim() || c[col("소재지지번주소")]?.trim();
    if (!name || !addr) continue;
    const pos = await geocode(addr);
    if (!pos || !inside(pos.lat, pos.lng)) continue;
    out.push({
      name,
      addr,
      lat: Number(pos.lat.toFixed(6)),
      lng: Number(pos.lng.toFixed(6)),
      // 개방시간 값은 "상시" 아니면 "정시" 두 가지뿐이다 (61 : 66).
      // 그대로 쓰면 무슨 뜻인지 알 수 없으니 풀어 적고, 상세가 있으면 덧붙인다.
      hours: readableHours(c[col("개방시간")], c[col("개방시간상세")]),
      // 학부모·안전에 실제로 쓰이는 항목만 남긴다
      diaper: /Y|있/.test(c[col("기저귀교환대유무")] ?? ""),
      bell: /Y|있/.test(c[col("비상벨설치여부")] ?? ""),
      cctv: /Y|있/.test(c[col("화장실입구CCTV설치유무")] ?? ""),
      disabled:
        Number(c[col("남성용-장애인용대변기수")] || 0) +
          Number(c[col("여성용-장애인용대변기수")] || 0) >
        0,
    });
    process.stdout.write(`\r  화장실 ${out.length}건`);
  }
  console.log();
  return out;
}

function readableHours(kind, detail) {
  const k = (kind ?? "").trim();
  const d = (detail ?? "").trim();
  if (k === "상시") return d && d !== "상시" ? `상시 개방 · ${d}` : "상시 개방";
  if (k === "정시") return d ? `개방시간 · ${d}` : "정해진 시간에만 개방";
  return d || "";
}

/** 쉼표가 든 값이 있어 따옴표를 지켜 잘라야 한다 */
function splitCsv(line) {
  const out = [];
  let cur = "";
  let q = false;
  for (const ch of line) {
    if (ch === '"') q = !q;
    else if (ch === "," && !q) { out.push(cur); cur = ""; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}

const parks = await collect("tn_pubr_public_cty_park_info_api", "도시공원");
const lots = await collect("tn_pubr_prkplce_info_api", "주차장");
const wcs = await toilets();

const j = (v) => JSON.stringify(v ?? "");
const num = (v) => Number(Number(v).toFixed(6));

writeFileSync(
  join(root, "src/lib/uiwang-facilities.ts"),
  `/**
 * 의왕시 생활편의 시설 — 행정안전부 표준데이터.
 *
 * 손으로 고치지 말 것. \`npm run facilities:fetch\` 가 만든다.
 * 전국 데이터라 요청마다 부르면 2만 건을 훑어야 해서 굳혀 둔다.
 *
 * 공원 ${parks.length}곳 · 주차장 ${lots.length}곳 · 공중화장실 ${wcs.length}곳
 */

export interface Park {
  name: string;
  kind: string;
  addr: string;
  /** 면적 m² */
  area: number | null;
  lat: number;
  lng: number;
}

export interface ParkingLot {
  name: string;
  kind: string;
  addr: string;
  /** 주차 구획 수 */
  slots: number | null;
  /** 유료 / 무료 */
  fee: string;
  /** 평일 운영시간 "09:00~18:00" — 비어 있으면 정보 없음 */
  weekday: string;
  charge: string;
  lat: number;
  lng: number;
}

export interface PublicToilet {
  name: string;
  addr: string;
  hours: string;
  diaper: boolean;
  bell: boolean;
  cctv: boolean;
  disabled: boolean;
  lat: number;
  lng: number;
}

export const UIWANG_PARKS: Park[] = [
${parks
  .map(
    (p) =>
      `  { name: ${j(p.parkNm)}, kind: ${j(p.parkSe)}, addr: ${j(p.rdnmadr || p.lnmadr)}, ` +
      `area: ${Number(p.parkAr) || null}, lat: ${num(p.latitude)}, lng: ${num(p.longitude)} },`,
  )
  .join("\n")}
];

export const UIWANG_PARKING: ParkingLot[] = [
${lots
  .map((p) => {
    const wd =
      p.weekdayOperOpenHhmm && p.weekdayOperColseHhmm
        ? `${p.weekdayOperOpenHhmm}~${p.weekdayOperColseHhmm}`
        : "";
    return (
      `  { name: ${j(p.prkplceNm)}, kind: ${j(p.prkplceSe)}, addr: ${j(p.rdnmadr || p.lnmadr)}, ` +
      `slots: ${Number(p.prkcmprt) || null}, fee: ${j(p.parkingchrgeInfo)}, weekday: ${j(wd)}, ` +
      `charge: ${j(p.basicCharge ? `${p.basicTime}분 ${p.basicCharge}원` : "")}, ` +
      `lat: ${num(p.latitude)}, lng: ${num(p.longitude)} },`
    );
  })
  .join("\n")}
];

export const UIWANG_TOILETS: PublicToilet[] = [
${wcs
  .map(
    (t) =>
      `  { name: ${j(t.name)}, addr: ${j(t.addr)}, hours: ${j(t.hours)}, ` +
      `diaper: ${t.diaper}, bell: ${t.bell}, cctv: ${t.cctv}, disabled: ${t.disabled}, ` +
      `lat: ${t.lat}, lng: ${t.lng} },`,
  )
  .join("\n")}
];
`,
);
console.log(`\nsrc/lib/uiwang-facilities.ts — 공원 ${parks.length} · 주차장 ${lots.length} · 화장실 ${wcs.length}`);
