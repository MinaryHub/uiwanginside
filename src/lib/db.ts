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

/**
 * 테이블을 없으면 만든다.
 *
 * 별도 마이그레이션 도구를 두기엔 스키마가 작아 첫 요청에서 보장한다.
 * 프로세스당 한 번만 시도한다.
 */
export async function ensureSchema(): Promise<void> {
  if (ensured) return;
  const sql = getSql();

  await sql`
    CREATE TABLE IF NOT EXISTS place_ratings (
      id          BIGSERIAL PRIMARY KEY,
      place_id    TEXT      NOT NULL,
      place_name  TEXT      NOT NULL,
      stars       SMALLINT  NOT NULL CHECK (stars BETWEEN 1 AND 5),
      comment     TEXT,
      device_id   TEXT      NOT NULL,
      -- 평가 당시 위치. 사후 검증과 분쟁 확인을 위해 남긴다.
      rated_lat   DOUBLE PRECISION NOT NULL,
      rated_lng   DOUBLE PRECISION NOT NULL,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
      -- 같은 기기가 같은 가게를 두 번 평가할 수 없다 (수정은 덮어쓰기)
      UNIQUE (place_id, device_id)
    )
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS place_ratings_place_idx ON place_ratings (place_id)
  `;
  // 속도 제한 판정용 — 최근 등록을 기기 단위로 빠르게 센다
  await sql`
    CREATE INDEX IF NOT EXISTS place_ratings_device_time_idx
      ON place_ratings (device_id, created_at DESC)
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS photos (
      id          BIGSERIAL PRIMARY KEY,
      user_id     TEXT      NOT NULL,
      url         TEXT      NOT NULL,
      pathname    TEXT      NOT NULL,
      caption     TEXT,
      lat         DOUBLE PRECISION NOT NULL,
      lng         DOUBLE PRECISION NOT NULL,
      -- 위치를 어디서 얻었는지. 사진 EXIF 가 가장 정확하고, 없으면 현위치다.
      loc_source  TEXT      NOT NULL DEFAULT 'device',
      taken_at    TIMESTAMPTZ,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS photos_user_idx ON photos (user_id, created_at DESC)
  `;

  /**
   * 나만의 장소 리스트.
   * share_slug 가 있으면 그 링크를 아는 사람은 로그인 없이 볼 수 있다.
   * 공유를 끄면 slug 를 지워 링크가 즉시 무효가 된다.
   */
  await sql`
    CREATE TABLE IF NOT EXISTS place_lists (
      id          BIGSERIAL PRIMARY KEY,
      user_id     TEXT      NOT NULL,
      owner_name  TEXT,
      title       TEXT      NOT NULL,
      description TEXT,
      share_slug  TEXT      UNIQUE,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS place_lists_user_idx
      ON place_lists (user_id, updated_at DESC)
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS place_list_items (
      id         BIGSERIAL PRIMARY KEY,
      list_id    BIGINT    NOT NULL REFERENCES place_lists(id) ON DELETE CASCADE,
      place_id   TEXT      NOT NULL,
      name       TEXT      NOT NULL,
      category   TEXT      NOT NULL,
      address    TEXT,
      phone      TEXT,
      lat        DOUBLE PRECISION NOT NULL,
      lng        DOUBLE PRECISION NOT NULL,
      note       TEXT,
      sort_order INT       NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (list_id, place_id)
    )
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS place_list_items_list_idx
      ON place_list_items (list_id, sort_order, created_at)
  `;

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
      member     BOOLEAN   NOT NULL DEFAULT false
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS visits_at_idx ON visits (at DESC)`;
  await sql`CREATE INDEX IF NOT EXISTS visits_visitor_idx ON visits (visitor_id, at DESC)`;

  ensured = true;
}
