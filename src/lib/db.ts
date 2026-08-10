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

  ensured = true;
}
