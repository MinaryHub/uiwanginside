import { neon } from "@neondatabase/serverless";

/**
 * Neon Postgres 접속.
 *
 * neon() 은 DATABASE_URL 이 없으면 즉시 던진다. 모듈 최상위에서 호출하면
 * 환경변수가 아직 없는 첫 배포에서 빌드가 깨지므로 지연 초기화한다.
 */
type Sql = ReturnType<typeof neon>;

let cached: Sql | null = null;

export function dbUrl(): string | undefined {
  // Neon 통합은 DATABASE_URL 을 넣지만, 풀링 전용 변수만 있는 경우도 있다
  return (
    process.env.DATABASE_URL ??
    process.env.POSTGRES_URL ??
    process.env.DATABASE_URL_UNPOOLED
  );
}

export function hasDb(): boolean {
  return !!dbUrl();
}

export function getSql(): Sql {
  if (!cached) {
    const url = dbUrl();
    if (!url) throw new Error("DATABASE_URL 이 설정되지 않았습니다");
    cached = neon(url);
  }
  return cached;
}

let ensured = false;
let ensuring: Promise<void> | null = null;

/**
 * 테이블을 없으면 만든다.
 *
 * 별도 마이그레이션 도구를 두기엔 스키마가 작아 첫 요청에서 보장한다.
 * 동시 콜드스타트 요청이 DDL 을 겹쳐 실행하지 않도록 진행 중인 Promise 를 공유한다.
 */
export function ensureSchema(): Promise<void> {
  if (ensured) return Promise.resolve();
  if (ensuring) return ensuring;

  ensuring = (async () => {
    const sql = getSql();

    /**
     * 접속 기록.
     *
     * 개인을 알아볼 수 있는 것은 남기지 않는다. IP 도 UA 원문도 저장하지
     * 않고, 방문자 구분은 브라우저가 스스로 만든 임의의 값(visitor_id)만
     * 쓴다. 이 값은 서버가 발급하지도, 어디에도 내보내지도 않는다.
     */
    await sql`
      CREATE TABLE IF NOT EXISTS visits (
        id         BIGSERIAL PRIMARY KEY,
        at         TIMESTAMPTZ NOT NULL DEFAULT now(),
        path       TEXT      NOT NULL,
        -- 어떤 목적으로 왔는지 (맛집·생활·의료·교통, 없으면 둘러보기)
        mode       TEXT,
        -- 유입 경로는 호스트만. 전체 URL 은 사생활이 묻어난다.
        referrer   TEXT,
        device     TEXT      NOT NULL DEFAULT 'unknown',
        visitor_id TEXT      NOT NULL,
        session_id TEXT      NOT NULL,
        -- 로그인 기능을 없앤 뒤로는 늘 false 다. 기존 표와 맞추려고 남겨 둔다.
        member     BOOLEAN   NOT NULL DEFAULT false
      )
    `;
    await sql`CREATE INDEX IF NOT EXISTS visits_at_idx ON visits (at DESC)`;
    await sql`CREATE INDEX IF NOT EXISTS visits_visitor_idx ON visits (visitor_id, at DESC)`;

    /**
     * CCTV 영상 주소.
     *
     * ITS 가 Vercel 에서 이따금 막힌다. 마지막으로 받아둔 주소를 남겨,
     * 막힌 동안에도 영상이 계속 나오게 한다. 서명 주소라 오래되면 못 쓰므로
     * 받은 시각을 함께 둔다.
     */
    await sql`
      CREATE TABLE IF NOT EXISTS cctv_urls (
        id  TEXT PRIMARY KEY,
        url TEXT NOT NULL,
        at  TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `;

    /**
     * 마지막으로 성공한 소통정보.
     *
     * ITS 가 Vercel 에서 이따금 통째로 막힌다. 인스턴스 메모리에만 두면
     * 서버리스라 인스턴스가 갈릴 때마다 빈손으로 시작해, 막힌 동안 도로
     * 색이 통째로 사라진다. CCTV 주소와 같은 이유로 여기 둔다.
     *
     * failed_at 은 마지막으로 실패한 시각이다. 막힌 것을 확인하고도
     * 인스턴스마다 다시 두드리면 요청 하나가 11초씩 걸린다.
     */
    await sql`
      CREATE TABLE IF NOT EXISTS traffic_snapshot (
        id        TEXT PRIMARY KEY,
        payload   JSONB,
        at        TIMESTAMPTZ,
        failed_at TIMESTAMPTZ
      )
    `;

    /**
     * 공장 대표주소 지오코딩 캐시.
     * 공공 API(ODCloud)로 받은 공장 목록에는 좌표가 없으므로, 한 번 변환한
     * 건물 주소를 저장해 서버리스 인스턴스가 갈려도 재호출을 줄인다.
     */
    await sql`
      CREATE TABLE IF NOT EXISTS factory_coords (
        addr TEXT PRIMARY KEY,
        lat  DOUBLE PRECISION,
        lng  DOUBLE PRECISION,
        dong TEXT,
        at   TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `;

    /**
     * 서버리스 인스턴스 공용 외부 API 캐시 (L2).
     *
     * 동시 접속으로 Vercel 인스턴스가 여러 개 떠도 같은 공공 API 를
     * 인스턴스마다 중복 호출하지 않게 막고, 상류 API 호출 제한(429/99)이나
     * 일시 장애 시 마지막 정상 응답(stale)을 안전하게 되돌려 준다.
     */
    await sql`
      CREATE TABLE IF NOT EXISTS api_cache (
        key        TEXT PRIMARY KEY,
        payload    JSONB       NOT NULL,
        notice     TEXT,
        at         TIMESTAMPTZ NOT NULL DEFAULT now(),
        expires_at TIMESTAMPTZ NOT NULL
      )
    `;

    ensured = true;
  })().finally(() => {
    ensuring = null;
  });

  return ensuring;
}
