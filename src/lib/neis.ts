import { timedFetch, createTtlCache } from "./fetcher";

/**
 * 나이스 교육정보 개방 포털.
 *
 * 인증키 없이도 응답하지만 요청당 5행까지만 준다 (2,667건 중 5건).
 * NEIS_API_KEY 를 넣으면 그 제한이 풀린다 — 실측으로 pSize=100 이
 * 100행을 돌려준다. 학급수를 세려면 학급 행을 다 받아야 하므로 키가
 * 있어야 한다.
 *
 * 학생수·진학률은 여기 없다. 그쪽은 학교알리미(EDSS) 소관이다.
 */
const NEIS = "https://open.neis.go.kr/hub";
/** 경기도교육청 */
const OFFICE = "J10";

/** 학교 기본정보는 학년이 바뀌어도 그대로다 */
const TTL_MS = 12 * 60 * 60_000;
const MEAL_TTL_MS = 6 * 60 * 60_000;

interface NeisSchool {
  SD_SCHUL_CODE: string;
  SCHUL_NM: string;
  SCHUL_KND_SC_NM: string;
  FOND_SC_NM: string;
  COEDU_SC_NM: string;
  ORG_TELNO: string;
  HMPG_ADRES: string;
  ORG_RDNMA: string;
  FOND_YMD: string;
  HS_SC_NM: string;
  DGHT_SC_NM: string;
}

export interface SchoolFacts {
  code: string;
  /** 나이스에 등록된 정식 이름 (카카오 이름과 다를 수 있다) */
  officialName: string;
  /** 초등학교 / 중학교 / 고등학교 … */
  kind: string;
  /** 공립 / 사립 */
  founder: string;
  /** 남여공학 / 남 / 여 */
  coed: string;
  tel: string | null;
  homepage: string | null;
  /** 개교기념일 (YYYYMMDD → YYYY-MM-DD) */
  foundedAt: string | null;
  /** 고등학교만: 일반계 / 특성화 … */
  highKind: string | null;
  meal: SchoolMeal | null;
  /** 학년별 학급 수. 키가 없으면 셀 수 없어 null 이다. */
  classes: { grade: number; count: number }[] | null;
  /** 전체 학급 수 */
  classTotal: number | null;
}

export interface SchoolMeal {
  /** YYYY-MM-DD */
  date: string;
  /** 오늘 것인지, 앞으로 있을 급식인지 */
  when: "today" | "next";
  dishes: string[];
  kcal: string | null;
}

function pick<T>(json: unknown, service: string): T[] {
  const j = json as Record<string, [unknown, { row?: T[] }] | undefined>;
  return j[service]?.[1]?.row ?? [];
}

async function neis<T>(
  service: string,
  params: Record<string, string>,
  pSize = 5,
): Promise<T[]> {
  const q = new URLSearchParams({
    Type: "json",
    pIndex: "1",
    pSize: String(pSize),
    ATPT_OFCDC_SC_CODE: OFFICE,
    ...params,
  });
  const key = process.env.NEIS_API_KEY;
  // 키가 있으면 붙인다. 없어도 동작하지만 요청당 5행으로 묶인다.
  if (key) q.set("KEY", key);

  const res = await timedFetch(`${NEIS}/${service}?${q}`, {}, 8000);
  if (!res.ok) throw new Error(`neis ${service} ${res.status}`);
  return pick<T>(await res.json(), service);
}

/** YYYYMMDD → YYYY-MM-DD */
function dashed(v?: string): string | null {
  return v && v.length === 8 ? `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}` : null;
}

function kstYmd(offsetDays = 0): string {
  const now = new Date(Date.now() + offsetDays * 86_400_000);
  const kst = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Seoul" }));
  return `${kst.getFullYear()}${String(kst.getMonth() + 1).padStart(2, "0")}${String(
    kst.getDate(),
  ).padStart(2, "0")}`;
}

interface NeisMeal {
  MLSV_YMD: string;
  DDISH_NM: string;
  CAL_INFO: string;
}

/**
 * 오늘 급식. 없으면 앞으로 이레 안의 다음 급식을 찾는다.
 *
 * 방학이나 주말에는 오늘 급식이 없는 것이 정상이다 (INFO-200). 그때
 * "정보 없음" 만 띄우면 고장처럼 보이므로, 다음 급식일을 대신 보여준다.
 * 날짜 범위로 한 번에 받아 하루씩 일곱 번 두드리지 않는다.
 */
async function fetchMeal(code: string): Promise<SchoolMeal | null> {
  const today = kstYmd();
  const rows = await neis<NeisMeal>("mealServiceDietInfo", {
    SD_SCHUL_CODE: code,
    MLSV_FROM_YMD: today,
    MLSV_TO_YMD: kstYmd(7),
  });
  if (rows.length === 0) return null;

  // 날짜순으로 정렬해 가장 이른 것을 고른다
  rows.sort((a, b) => a.MLSV_YMD.localeCompare(b.MLSV_YMD));
  const r = rows[0];
  return {
    date: dashed(r.MLSV_YMD) ?? r.MLSV_YMD,
    when: r.MLSV_YMD === today ? "today" : "next",
    dishes: (r.DDISH_NM ?? "")
      .split(/<br\s*\/?>/)
      // 알레르기 유발식품 번호는 괄호로 붙어 온다. 화면에서는 덜어낸다.
      .map((d) => d.replace(/\([\d.\s]+\)/g, "").trim())
      .filter(Boolean),
    kcal: r.CAL_INFO?.trim() || null,
  };
}

interface NeisClass {
  GRADE: string;
}

/**
 * 학년별 학급 수.
 *
 * 나이스는 학급 하나를 한 행으로 준다. 학생 수는 주지 않으므로 셀 수
 * 있는 것은 학급 수까지다. 그래도 "1학년 8반" 은 학교 규모를 가늠하는
 * 데 쓸 만하다.
 *
 * 키가 없으면 5행까지만 와서 24학급이 5학급으로 보인다. 그럴 때는
 * 틀린 수를 보여주는 대신 아무것도 내보내지 않는다.
 */
async function fetchClasses(
  code: string,
): Promise<{ classes: { grade: number; count: number }[]; total: number } | null> {
  if (!process.env.NEIS_API_KEY) return null;

  const rows = await neis<NeisClass>(
    "classInfo",
    { SD_SCHUL_CODE: code, AY: schoolYear() },
    500,
  );
  if (rows.length === 0) return null;

  const byGrade = new Map<number, number>();
  for (const r of rows) {
    const g = Number(r.GRADE);
    if (!Number.isFinite(g)) continue;
    byGrade.set(g, (byGrade.get(g) ?? 0) + 1);
  }
  return {
    classes: [...byGrade.entries()].sort((a, b) => a[0] - b[0]).map(([grade, count]) => ({ grade, count })),
    total: rows.length,
  };
}

/**
 * 학년도. 3월에 바뀐다 — 1·2월에 올해를 물으면 아직 편성되지 않아 빈다.
 */
function schoolYear(): string {
  const kst = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Seoul" }));
  return String(kst.getMonth() + 1 >= 3 ? kst.getFullYear() : kst.getFullYear() - 1);
}

const cache = createTtlCache<SchoolFacts | null>(TTL_MS);
const mealCache = createTtlCache<SchoolMeal | null>(MEAL_TTL_MS);

/**
 * 카카오가 준 학교 이름으로 나이스 정보를 찾는다.
 *
 * 이름이 서로 다를 수 있다 — 카카오 "부곡중학교", 나이스 "의왕부곡중학교".
 * 나이스는 이름을 부분 일치로 찾아주므로 그대로 넘기면 되지만, 그러면
 * 부천부곡중학교까지 함께 온다. 도로명주소에 의왕시가 든 것만 받아들인다.
 * 엉뚱한 학교의 급식을 우리 동네 학교라고 보여주는 것보다, 못 찾았다고
 * 하는 편이 낫다.
 */
export async function fetchSchool(name: string): Promise<SchoolFacts | null> {
  const trimmed = name.trim();
  if (!trimmed) return null;

  const hit = cache.get(trimmed);
  if (hit !== undefined) {
    // 학교 정보는 반년을 두고, 급식만 다시 본다
    return hit && { ...hit, meal: await withMeal(hit) };
  }

  const rows = await neis<NeisSchool>("schoolInfo", { SCHUL_NM: trimmed });
  const found = rows.find((r) => (r.ORG_RDNMA ?? "").includes("의왕시"));
  if (!found) {
    cache.set(trimmed, null);
    return null;
  }

  const facts: SchoolFacts = {
    code: found.SD_SCHUL_CODE,
    officialName: found.SCHUL_NM,
    kind: found.SCHUL_KND_SC_NM,
    founder: found.FOND_SC_NM,
    coed: found.COEDU_SC_NM,
    tel: found.ORG_TELNO?.trim() || null,
    homepage: normalizeUrl(found.HMPG_ADRES),
    foundedAt: dashed(found.FOND_YMD),
    // 초·중학교에는 없는 값이다
    highKind: found.HS_SC_NM?.trim() || null,
    meal: null,
    classes: null,
    classTotal: null,
  };

  // 급식과 학급은 서로 무관하니 함께 받는다
  const [meal, cls] = await Promise.all([
    withMeal(facts),
    fetchClasses(facts.code).catch(() => null),
  ]);
  const full: SchoolFacts = {
    ...facts,
    classes: cls?.classes ?? null,
    classTotal: cls?.total ?? null,
  };
  cache.set(trimmed, full);
  return { ...full, meal };
}

async function withMeal(facts: SchoolFacts): Promise<SchoolMeal | null> {
  const cached = mealCache.get(facts.code);
  if (cached !== undefined) return cached;
  try {
    const meal = await fetchMeal(facts.code);
    mealCache.set(facts.code, meal);
    return meal;
  } catch {
    // 급식을 못 받아도 학교 정보는 보여준다
    return null;
  }
}

/** 나이스는 "uiwangbugokcho.goegu.kr" 처럼 스킴 없이 주기도 한다 */
function normalizeUrl(v?: string): string | null {
  const s = v?.trim();
  if (!s) return null;
  return /^https?:\/\//.test(s) ? s : `http://${s}`;
}
