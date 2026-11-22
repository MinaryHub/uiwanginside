import { getSql, ensureSchema, hasDb } from "@/lib/db";
import { createTtlCache } from "@/lib/fetcher";

export const dynamic = "force-dynamic";

const BOT = /bot|crawler|spider|crawling|preview|facebookexternalhit|slurp|monitor|lighthouse|headless/i;

const DEVICES = ["mobile", "tablet", "desktop"] as const;
type Device = (typeof DEVICES)[number];

/** 동일 방문자·경로 단기 도배 차단 (인스턴스당 경량 쓰로틀) */
const recentVisits = createTtlCache<number>(10_000, 2000);

function isDevice(v: unknown): v is Device {
  return typeof v === "string" && (DEVICES as readonly string[]).includes(v);
}

function clamp(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s ? s.slice(0, max) : null;
}

function requestHost(req: Request): string {
  const fwd = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (fwd) return fwd.split(",")[0].trim().replace(/:\d+$/, "").toLowerCase();
  try {
    return new URL(req.url).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function redactStatsPath(rawPath: string | null): string | null {
  if (!rawPath) return null;
  const normalized = rawPath.replace(/^\/+/, "/");
  if (/^\/(?:api\/)?stats(?:\/|$)/i.test(normalized)) return "/stats/[token]";
  return normalized;
}

const NO_CONTENT = { status: 204, headers: { "Cache-Control": "no-store" } } as const;

export async function POST(req: Request) {
  // 통계 때문에 사용자 화면이 멈추면 안 된다. 어떤 실패도 조용히 넘긴다.
  if (!hasDb()) return new Response(null, NO_CONTENT);

  const ua = req.headers.get("user-agent") ?? "";
  if (BOT.test(ua)) return new Response(null, NO_CONTENT);

  // 타 출처에서의 직접 DB 쓰기 남용을 막는다
  const selfHost = requestHost(req);
  const origin = req.headers.get("origin");
  if (origin && selfHost) {
    try {
      const originHost = new URL(origin).hostname.toLowerCase();
      if (originHost !== selfHost) return new Response(null, NO_CONTENT);
    } catch {
      return new Response(null, NO_CONTENT);
    }
  }

  let parsed: unknown;
  try {
    parsed = await req.json();
  } catch {
    return new Response(null, NO_CONTENT);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return new Response(null, NO_CONTENT);
  }
  const body = parsed as Record<string, unknown>;

  const path = redactStatsPath(clamp(body.path, 120));
  const visitorId = clamp(body.visitorId, 64);
  const sessionId = clamp(body.sessionId, 64);
  if (!path || !visitorId || !sessionId) return new Response(null, NO_CONTENT);

  const mode = clamp(body.mode, 20);
  const throttleKey = `${visitorId}|${path}|${mode ?? ""}`;
  if (recentVisits.get(throttleKey)) return new Response(null, NO_CONTENT);
  recentVisits.set(throttleKey, 1);

  // 리퍼러는 호스트만 남긴다. 리버스 프록시 뒤에서도 자기 도메인을 정확히 제외한다.
  let referrer: string | null = null;
  const raw = clamp(body.referrer, 300);
  if (raw) {
    try {
      const h = new URL(raw).hostname.toLowerCase();
      referrer = h && h !== selfHost ? h.slice(0, 80) : null;
    } catch {
      referrer = null;
    }
  }

  try {
    await ensureSchema();
    const sql = getSql();
    await sql`
      INSERT INTO visits (path, mode, referrer, device, visitor_id, session_id)
      VALUES (${path}, ${mode}, ${referrer},
              ${isDevice(body.device) ? body.device : "unknown"},
              ${visitorId}, ${sessionId})
    `;
  } catch (e) {
    console.error("[visit]", e);
  }
  return new Response(null, NO_CONTENT);
}
