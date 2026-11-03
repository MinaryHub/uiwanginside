import { getSql, ensureSchema, hasDb } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * 접속 기록.
 *
 * 통계를 보려면 먼저 기록이 있어야 한다. 외부 분석 도구를 붙이는 대신
 * 이미 쓰고 있는 Postgres 에 최소한만 남긴다 — 방문자 수를 세는 데
 * 필요한 것 이상은 받지도 저장하지도 않는다.
 *
 * 남기지 않는 것: IP, User-Agent 원문, 전체 리퍼러 URL.
 * 남기는 것: 경로, 모드, 리퍼러 호스트, 기기 종류(모바일/PC/태블릿),
 *            브라우저가 스스로 만든 임의의 방문자·세션 값.
 */

/** 사람이 아닌 접속은 통계를 흐린다 */
const BOT = /bot|crawler|spider|crawling|preview|facebookexternalhit|slurp|monitor|lighthouse|headless/i;

const DEVICES = ["mobile", "tablet", "desktop"] as const;
type Device = (typeof DEVICES)[number];

function isDevice(v: unknown): v is Device {
  return typeof v === "string" && (DEVICES as readonly string[]).includes(v);
}

/** 값이 커지면 그대로 저장 공간이자 화면 잡음이 된다 */
function clamp(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s ? s.slice(0, max) : null;
}

export async function POST(req: Request) {
  // 통계 때문에 사용자 화면이 멈추면 안 된다. 어떤 실패도 조용히 넘긴다.
  if (!hasDb()) return new Response(null, { status: 204 });

  const ua = req.headers.get("user-agent") ?? "";
  if (BOT.test(ua)) return new Response(null, { status: 204 });

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return new Response(null, { status: 204 });
  }

  /*
   * 식별자가 든 경로는 여기서도 뭉뚱그린다.
   *
   * 화면 쪽에서 이미 바꿔 보내지만, 이 주소는 누구나 두드릴 수 있다.
   * /stats/<토큰> 이 표에 그대로 적히면 통계 화면이 자기 비밀 주소를
   * 남에게 보여주게 된다. 들어오는 값을 믿지 않는다.
   */
  const rawPath = clamp(body.path, 120);
  const path = rawPath?.startsWith("/stats/") ? "/stats/[token]" : rawPath;
  const visitorId = clamp(body.visitorId, 64);
  const sessionId = clamp(body.sessionId, 64);
  if (!path || !visitorId || !sessionId) return new Response(null, { status: 204 });

  // 리퍼러는 호스트만 남긴다. 어디서 무엇을 검색해 왔는지까지는 알 필요가 없다.
  let referrer: string | null = null;
  const raw = clamp(body.referrer, 300);
  if (raw) {
    try {
      const h = new URL(raw).hostname;
      referrer = h && h !== new URL(req.url).hostname ? h.slice(0, 80) : null;
    } catch {
      referrer = null;
    }
  }

  try {
    await ensureSchema();
    const sql = getSql();
    await sql`
      INSERT INTO visits (path, mode, referrer, device, visitor_id, session_id)
      VALUES (${path}, ${clamp(body.mode, 20)}, ${referrer},
              ${isDevice(body.device) ? body.device : "unknown"},
              ${visitorId}, ${sessionId})
    `;
  } catch (e) {
    console.error("[visit]", e);
  }
  return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
}
