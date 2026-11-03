import { nowISO } from "@/lib/fetcher";
import { getSql, ensureSchema } from "@/lib/db";
import { MODE_MAP, type ModeId } from "@/lib/modes";
import type { StatsPayload, StatsSummary, Bucket, NamedCount } from "@/lib/statsTypes";

/**
 * 접속 통계 집계.
 *
 * 비밀 주소(/stats/<토큰>)로만 연다. 누가 볼 자격이 있는지는 여기서
 * 따지지 않는다. 부르는 쪽의 몫이다.
 */
const EMPTY_SUM: StatsSummary = { views: 0, visitors: 0, sessions: 0 };
export const EMPTY_STATS: StatsPayload = {
  now: 0,
  today: EMPTY_SUM,
  yesterday: EMPTY_SUM,
  last7: EMPTY_SUM,
  last30: EMPTY_SUM,
  hourly: [],
  daily: [],
  modes: [],
  paths: [],
  referrers: [],
  devices: [],
  since: null,
  updatedAt: "",
};

/**
 * 모든 집계를 한국 시각으로 낸다.
 * 서버는 UTC 로 도는데 '오늘' 을 UTC 로 세면 한국 시각 오전 9시에 날짜가
 * 바뀐다. 보는 사람이 사는 시간대에 맞춘다.
 */
const KST = "Asia/Seoul";

interface SumRow {
  views: number;
  visitors: number;
  sessions: number;
}

function toSummary(r?: SumRow): StatsSummary {
  if (!r) return EMPTY_SUM;
  return {
    views: Number(r.views ?? 0),
    visitors: Number(r.visitors ?? 0),
    sessions: Number(r.sessions ?? 0),
  };
}

export async function collectStats(): Promise<StatsPayload> {
  await ensureSchema();
  const sql = getSql();

  const span = (from: string, to: string) => sql`
    SELECT COUNT(*)::int                                    AS views,
           COUNT(DISTINCT visitor_id)::int                  AS visitors,
           COUNT(DISTINCT session_id)::int                  AS sessions
      FROM visits
     WHERE at >= ${from}::timestamptz AND at < ${to}::timestamptz
  `;

  // 한국 시각 자정 경계를 SQL 이 직접 계산하게 둔다
  const [bounds] = (await sql`
    SELECT date_trunc('day', now() AT TIME ZONE ${KST}) AT TIME ZONE ${KST} AS today,
           (date_trunc('day', now() AT TIME ZONE ${KST}) - interval '1 day')
             AT TIME ZONE ${KST}                             AS yesterday,
           (date_trunc('day', now() AT TIME ZONE ${KST}) - interval '6 day')
             AT TIME ZONE ${KST}                             AS d7,
           (date_trunc('day', now() AT TIME ZONE ${KST}) - interval '29 day')
             AT TIME ZONE ${KST}                             AS d30,
           now()                                             AS now
  `) as { today: string; yesterday: string; d7: string; d30: string; now: string }[];

  const [
    today,
    yesterday,
    last7,
    last30,
    liveRows,
    hourlyRows,
    dailyRows,
    modeRows,
    pathRows,
    refRows,
    devRows,
    sinceRows,
  ] = await Promise.all([
    span(bounds.today, bounds.now),
    span(bounds.yesterday, bounds.today),
    span(bounds.d7, bounds.now),
    span(bounds.d30, bounds.now),
    sql`SELECT COUNT(DISTINCT visitor_id)::int AS n
          FROM visits WHERE at >= now() - interval '5 minutes'`,
    /*
     * 빈 구간도 0 으로 채운다.
     * 기록이 있는 시각만 뽑으면 새벽에 접속이 없던 시간이 그래프에서
     * 통째로 빠져, 한산했던 밤이 붐빈 것처럼 보인다.
     */
    sql`
      WITH slots AS (
        SELECT generate_series(
          date_trunc('hour', (now() AT TIME ZONE ${KST}) - interval '23 hours'),
          date_trunc('hour',  now() AT TIME ZONE ${KST}),
          interval '1 hour') AS bucket
      ), agg AS (
        SELECT date_trunc('hour', at AT TIME ZONE ${KST}) AS bucket,
               COUNT(*) AS views, COUNT(DISTINCT visitor_id) AS visitors
          FROM visits WHERE at >= now() - interval '24 hours' GROUP BY 1
      )
      SELECT to_char(s.bucket, 'MM/DD HH24시')      AS label,
             COALESCE(a.views, 0)::int              AS views,
             COALESCE(a.visitors, 0)::int           AS visitors
        FROM slots s LEFT JOIN agg a ON a.bucket = s.bucket
       ORDER BY s.bucket
    `,
    sql`
      WITH slots AS (
        SELECT generate_series(
          date_trunc('day', (now() AT TIME ZONE ${KST}) - interval '29 days'),
          date_trunc('day',  now() AT TIME ZONE ${KST}),
          interval '1 day') AS bucket
      ), agg AS (
        SELECT date_trunc('day', at AT TIME ZONE ${KST}) AS bucket,
               COUNT(*) AS views, COUNT(DISTINCT visitor_id) AS visitors
          FROM visits WHERE at >= ${bounds.d30}::timestamptz GROUP BY 1
      )
      SELECT to_char(s.bucket, 'MM/DD')             AS label,
             COALESCE(a.views, 0)::int              AS views,
             COALESCE(a.visitors, 0)::int           AS visitors
        FROM slots s LEFT JOIN agg a ON a.bucket = s.bucket
       ORDER BY s.bucket
    `,
    sql`
      SELECT COALESCE(mode, '') AS name, COUNT(*)::int AS count,
             COUNT(DISTINCT visitor_id)::int AS visitors
        FROM visits WHERE at >= ${bounds.d30}::timestamptz AND path = '/'
       GROUP BY 1 ORDER BY count DESC
    `,
    sql`
      SELECT path AS name, COUNT(*)::int AS count,
             COUNT(DISTINCT visitor_id)::int AS visitors
        FROM visits WHERE at >= ${bounds.d30}::timestamptz
       GROUP BY 1 ORDER BY count DESC LIMIT 12
    `,
    sql`
      SELECT referrer AS name, COUNT(*)::int AS count,
             COUNT(DISTINCT visitor_id)::int AS visitors
        FROM visits
       WHERE at >= ${bounds.d30}::timestamptz AND referrer IS NOT NULL
       GROUP BY 1 ORDER BY count DESC LIMIT 10
    `,
    sql`
      SELECT device AS name, COUNT(*)::int AS count,
             COUNT(DISTINCT visitor_id)::int AS visitors
        FROM visits WHERE at >= ${bounds.d30}::timestamptz
       GROUP BY 1 ORDER BY count DESC
    `,
    sql`SELECT MIN(at) AS since FROM visits`,
  ]);

  const rows = <T>(v: unknown) => v as T[];
  const bucket = (v: unknown): Bucket[] =>
    rows<{ label: string; views: number; visitors: number }>(v).map((r) => ({
      label: r.label,
      views: Number(r.views),
      visitors: Number(r.visitors),
    }));
  const named = (v: unknown): NamedCount[] =>
    rows<{ name: string | null; count: number; visitors: number }>(v).map((r) => ({
      name: r.name ?? "",
      count: Number(r.count),
      visitors: Number(r.visitors),
    }));

  return {
    now: Number(rows<{ n: number }>(liveRows)[0]?.n ?? 0),
    today: toSummary(rows<SumRow>(today)[0]),
    yesterday: toSummary(rows<SumRow>(yesterday)[0]),
    last7: toSummary(rows<SumRow>(last7)[0]),
    last30: toSummary(rows<SumRow>(last30)[0]),
    hourly: bucket(hourlyRows),
    daily: bucket(dailyRows),
    // 모드 코드를 사람이 읽는 이름으로. 빈 값은 아무것도 안 고른 상태다.
    modes: named(modeRows).map((m) => ({
      ...m,
      name: m.name ? (MODE_MAP[m.name as ModeId]?.label ?? m.name) : "둘러보기",
    })),
    paths: named(pathRows),
    referrers: named(refRows),
    devices: named(devRows),
    since: rows<{ since: string | null }>(sinceRows)[0]?.since
      ? new Date(rows<{ since: string }>(sinceRows)[0].since).toISOString()
      : null,
    updatedAt: nowISO(),
  } satisfies StatsPayload;
}
