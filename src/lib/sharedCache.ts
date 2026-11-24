import { ensureSchema, getSql, hasDb } from "./db";
import { createInFlight } from "./fetcher";

/**
 * 다중 접속 API 호출 제한(Rate Limit) 방어용 다계층 공용 캐시.
 *
 * 1) L1 (인스턴스 메모리): 신선하면 0ms 즉시 반환, 만료돼도 stale 백업 유지
 * 2) Single-Flight: 같은 키로 동시에 몰린 요청을 상류 1회 호출로 합침
 * 3) L2 (Neon Postgres `api_cache`): 서버리스 인스턴스가 여러 개 떠도
 *    신선한 응답을 공유해 공공 API 중복 호출을 차단
 * 4) Stale-While-Error + Failure Cooldown: 상류가 429/99/타임아웃을 내면
 *    마지막 정상 응답을 돌려주고 일정 시간 재시도를 억제해 할당량 소진을 방지
 */

export interface CachedResult<T> {
  value: T;
  notice?: string;
  stale: boolean;
  /** stale 응답일 때 마지막 정상 저장 시각으로부터 지난 분 */
  staleMinutes?: number;
}

interface MemEntry {
  value: unknown;
  notice?: string;
  at: number;
  expiresAt: number;
}

const MAX_MEM_ENTRIES = 160;
const memStore = new Map<string, MemEntry>();
const failCooldown = new Map<string, number>();
const inFlight = createInFlight<CachedResult<unknown>>();

function putMem(key: string, entry: MemEntry) {
  if (memStore.has(key)) {
    memStore.delete(key);
  } else if (memStore.size >= MAX_MEM_ENTRIES) {
    const oldest = memStore.keys().next().value;
    if (oldest !== undefined) memStore.delete(oldest);
  }
  memStore.set(key, entry);
}

async function readDb(key: string): Promise<MemEntry | null> {
  if (!hasDb()) return null;
  try {
    await ensureSchema();
    const sql = getSql();
    const rows = (await sql`
      SELECT payload, notice, at, expires_at
      FROM api_cache
      WHERE key = ${key}
      LIMIT 1
    `) as Array<{
      payload: unknown;
      notice: string | null;
      at: string | Date;
      expires_at: string | Date;
    }>;
    const row = rows[0];
    if (!row) return null;
    return {
      value: row.payload,
      notice: row.notice ?? undefined,
      at: new Date(row.at).getTime(),
      expiresAt: new Date(row.expires_at).getTime(),
    };
  } catch (e) {
    console.warn("[sharedCache:read]", key, e instanceof Error ? e.message : e);
    return null;
  }
}

async function writeDb(key: string, entry: MemEntry): Promise<void> {
  if (!hasDb()) return;
  try {
    await ensureSchema();
    const sql = getSql();
    const payloadJson = JSON.stringify(entry.value);
    const atIso = new Date(entry.at).toISOString();
    const expIso = new Date(entry.expiresAt).toISOString();
    await sql`
      INSERT INTO api_cache (key, payload, notice, at, expires_at)
      VALUES (${key}, ${payloadJson}::jsonb, ${entry.notice ?? null}, ${atIso}::timestamptz, ${expIso}::timestamptz)
      ON CONFLICT (key) DO UPDATE SET
        payload = EXCLUDED.payload,
        notice = EXCLUDED.notice,
        at = EXCLUDED.at,
        expires_at = EXCLUDED.expires_at
    `;
  } catch (e) {
    console.warn("[sharedCache:write]", key, e instanceof Error ? e.message : e);
  }
}

export interface SharedCacheOptions<T> {
  /** 전역 고유 캐시 키 (예: "weather", "air", "ev-chargers") */
  key: string;
  /** 정상 응답 신선 유지 시간 (ms) */
  ttlMs: number;
  /** 상류 오류 시 마지막 정상 데이터를 대신 돌려줄 수 있는 최대 경과 시간 (ms) */
  staleMaxMs?: number;
  /** 상류 실패 후 stale 이 있을 때 재호출을 잠시 멈추는 쿨다운 (ms) */
  failCooldownMs?: number;
  /** Neon DB 공용 L2 캐시 사용 여부 (기본 true) */
  useDb?: boolean;
  /** 실제 상류 API 호출. customTtlMs 를 주면 부분 실패 등 짧은 TTL 을 지정 가능 */
  fetcher: () => Promise<{ value: T; notice?: string; customTtlMs?: number }>;
}

export async function fetchWithSharedCache<T>(
  opts: SharedCacheOptions<T>,
): Promise<CachedResult<T>> {
  const {
    key,
    ttlMs,
    staleMaxMs = Math.max(ttlMs * 6, 30 * 60_000),
    failCooldownMs = 45_000,
    useDb = true,
    fetcher,
  } = opts;

  const now = Date.now();
  const mem = memStore.get(key);

  // 1) L1 신선 히트 → 즉시 반환
  if (mem && now < mem.expiresAt) {
    return { value: mem.value as T, notice: mem.notice, stale: false };
  }

  // 2) 직전에 실패했고 쓸 수 있는 L1 stale 이 있으면 쿨다운 동안 상류를 건드리지 않음
  const failedAt = failCooldown.get(key);
  if (failedAt && now - failedAt < failCooldownMs && mem && now - mem.at <= staleMaxMs) {
    const staleMinutes = Math.max(1, Math.round((now - mem.at) / 60_000));
    return {
      value: mem.value as T,
      notice: `공공 API 일시 지연으로 ${staleMinutes}분 전 데이터를 표시합니다.`,
      stale: true,
      staleMinutes,
    };
  }

  // 3) 같은 키로 동시 진입한 요청은 단일 작업으로 합침 (single-flight)
  const res = await inFlight(key, async (): Promise<CachedResult<unknown>> => {
    const tNow = Date.now();
    // 대기 중에 다른 요청이 방금 채워뒀을 수 있음
    const memAgain = memStore.get(key);
    if (memAgain && tNow < memAgain.expiresAt) {
      return { value: memAgain.value, notice: memAgain.notice, stale: false };
    }

    // L2 Neon Postgres 공용 캐시 확인
    let staleBackup: MemEntry | undefined =
      memAgain && tNow - memAgain.at <= staleMaxMs ? memAgain : undefined;

    if (useDb) {
      const dbHit = await readDb(key);
      if (dbHit) {
        if (tNow < dbHit.expiresAt) {
          putMem(key, dbHit);
          failCooldown.delete(key);
          return { value: dbHit.value, notice: dbHit.notice, stale: false };
        }
        if (tNow - dbHit.at <= staleMaxMs && (!staleBackup || dbHit.at > staleBackup.at)) {
          staleBackup = dbHit;
          putMem(key, dbHit);
        }
      }
    }

    // 4) 상류 API 실제 호출
    try {
      const fresh = await fetcher();
      const savedAt = Date.now();
      const effectiveTtl = fresh.customTtlMs ?? ttlMs;
      const entry: MemEntry = {
        value: fresh.value,
        notice: fresh.notice,
        at: savedAt,
        expiresAt: savedAt + effectiveTtl,
      };
      putMem(key, entry);
      failCooldown.delete(key);

      // L2 저장은 응답을 늦추지 않되 서버리스 종료 전에 안전하게 완료되도록 병렬 대기
      if (useDb) {
        await writeDb(key, entry);
      }
      return { value: fresh.value, notice: fresh.notice, stale: false };
    } catch (err) {
      failCooldown.set(key, Date.now());
      if (staleBackup) {
        const staleMinutes = Math.max(1, Math.round((Date.now() - staleBackup.at) / 60_000));
        console.warn(
          `[sharedCache:stale] ${key} 상류 실패로 ${staleMinutes}분 전 캐시 반환:`,
          err instanceof Error ? err.message : err,
        );
        return {
          value: staleBackup.value,
          notice: `공공 API 일시 지연으로 ${staleMinutes}분 전 데이터를 표시합니다.`,
          stale: true,
          staleMinutes,
        };
      }
      throw err;
    }
  });

  return res as CachedResult<T>;
}
