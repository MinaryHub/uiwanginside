import { ok, fail, nowISO } from "@/lib/fetcher";
import { getSql, ensureSchema, hasDb } from "@/lib/db";
import { isInsideUiwang, MAX_ACCURACY_M } from "@/lib/geo";
import type { RatingsPayload, PlaceRating } from "@/lib/types";

export const dynamic = "force-dynamic";

const EMPTY: RatingsPayload = { ratings: {}, updatedAt: "" };

/** 한 기기가 하루에 남길 수 있는 평가 수 */
const DAILY_LIMIT = 20;

/* ────────────────────────── 조회 ────────────────────────── */

export async function GET(req: Request) {
  if (!hasDb()) {
    return fail(EMPTY, "평가 저장소가 아직 연결되지 않았습니다.");
  }

  const sp = new URL(req.url).searchParams;
  const ids = (sp.get("placeIds") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 200);
  const deviceId = sp.get("deviceId")?.slice(0, 64) ?? "";

  if (ids.length === 0) return ok(EMPTY);

  try {
    await ensureSchema();
    const sql = getSql();

    const rows = (await sql`
      SELECT place_id,
             ROUND(AVG(stars)::numeric, 2)::float8 AS avg_stars,
             COUNT(*)::int                          AS count
        FROM place_ratings
       WHERE place_id = ANY(${ids})
       GROUP BY place_id
    `) as { place_id: string; avg_stars: number; count: number }[];

    // 내가 준 별점은 따로 조회해 "수정" UI 를 만들 수 있게 한다
    const mine = deviceId
      ? ((await sql`
          SELECT place_id, stars
            FROM place_ratings
           WHERE device_id = ${deviceId} AND place_id = ANY(${ids})
        `) as { place_id: string; stars: number }[])
      : [];
    const myMap = new Map(mine.map((m) => [m.place_id, m.stars]));

    const ratings: Record<string, PlaceRating> = {};
    for (const r of rows) {
      ratings[r.place_id] = {
        avg: r.avg_stars,
        count: r.count,
        mine: myMap.get(r.place_id) ?? null,
      };
    }
    // 평가는 없지만 내가 남긴 게 있는 경우는 없다(집계에 포함되므로) — 안전하게 보강
    for (const [pid, stars] of myMap) {
      if (!ratings[pid]) ratings[pid] = { avg: stars, count: 1, mine: stars };
    }

    /**
     * 캐시하지 않는다. deviceId 별로 내용이 다르고(내 별점), 방금 등록한 값이
     * 즉시 보여야 한다. 30초 CDN 캐시를 두었더니 등록 직후 재조회가 쓰기 이전
     * 응답을 받아 와 별점이 나왔다 사라지는 것처럼 보였다.
     */
    return ok({ ratings, updatedAt: nowISO() } satisfies RatingsPayload);
  } catch (e) {
    console.error("[ratings:get]", e);
    return fail(EMPTY, `평가 조회 실패: ${e instanceof Error ? e.message : e}`);
  }
}

/* ────────────────────────── 등록 ────────────────────────── */

interface Body {
  placeId?: unknown;
  placeName?: unknown;
  stars?: unknown;
  comment?: unknown;
  deviceId?: unknown;
  lat?: unknown;
  lng?: unknown;
  accuracy?: unknown;
}

function bad(message: string, status = 400) {
  return Response.json({ ok: false, message }, { status });
}

export async function POST(req: Request) {
  if (!hasDb()) return bad("평가 저장소가 아직 연결되지 않았습니다.", 503);

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return bad("요청 형식이 잘못되었습니다.");
  }

  const placeId = typeof body.placeId === "string" ? body.placeId.slice(0, 64) : "";
  const placeName = typeof body.placeName === "string" ? body.placeName.slice(0, 120) : "";
  const deviceId = typeof body.deviceId === "string" ? body.deviceId.slice(0, 64) : "";
  const stars = Number(body.stars);
  const comment =
    typeof body.comment === "string" && body.comment.trim()
      ? body.comment.trim().slice(0, 300)
      : null;
  const lat = Number(body.lat);
  const lng = Number(body.lng);
  const accuracy = Number(body.accuracy);

  if (!placeId || !placeName) return bad("가게 정보가 없습니다.");
  if (!deviceId || deviceId.length < 8) return bad("기기 식별자가 올바르지 않습니다.");
  if (!Number.isInteger(stars) || stars < 1 || stars > 5) {
    return bad("별점은 1~5 사이여야 합니다.");
  }

  // 위치 검증은 서버가 좌표로 직접 한다.
  // 클라이언트가 보낸 "의왕입니다" 같은 판정 결과는 신뢰하지 않는다.
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return bad("위치 정보가 필요합니다. 위치 권한을 허용해 주세요.");
  }
  if (Number.isFinite(accuracy) && accuracy > MAX_ACCURACY_M) {
    return bad(
      `위치 오차가 너무 큽니다 (약 ${Math.round(accuracy)}m). 실외에서 다시 시도해 주세요.`,
    );
  }
  if (!isInsideUiwang(lat, lng)) {
    return bad("의왕시 안에서만 평가할 수 있습니다.", 403);
  }

  try {
    await ensureSchema();
    const sql = getSql();

    // 속도 제한 — 기기 단위 하루 상한
    const [{ recent }] = (await sql`
      SELECT COUNT(*)::int AS recent
        FROM place_ratings
       WHERE device_id = ${deviceId}
         AND created_at > now() - interval '1 day'
    `) as { recent: number }[];
    if (recent >= DAILY_LIMIT) {
      return bad(`하루에 ${DAILY_LIMIT}개까지 평가할 수 있습니다.`, 429);
    }

    // 같은 기기가 같은 가게를 다시 평가하면 새로 쌓지 않고 고쳐 쓴다
    await sql`
      INSERT INTO place_ratings
        (place_id, place_name, stars, comment, device_id, rated_lat, rated_lng)
      VALUES
        (${placeId}, ${placeName}, ${stars}, ${comment}, ${deviceId}, ${lat}, ${lng})
      ON CONFLICT (place_id, device_id) DO UPDATE
        SET stars = EXCLUDED.stars,
            comment = EXCLUDED.comment,
            rated_lat = EXCLUDED.rated_lat,
            rated_lng = EXCLUDED.rated_lng,
            created_at = now()
    `;

    const [agg] = (await sql`
      SELECT ROUND(AVG(stars)::numeric, 2)::float8 AS avg_stars, COUNT(*)::int AS count
        FROM place_ratings
       WHERE place_id = ${placeId}
    `) as { avg_stars: number; count: number }[];

    return Response.json(
      { ok: true, avg: agg.avg_stars, count: agg.count, mine: stars },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    console.error("[ratings:post]", e);
    return bad(`평가 저장 실패: ${e instanceof Error ? e.message : e}`, 500);
  }
}
