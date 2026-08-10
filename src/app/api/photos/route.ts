import { put, del } from "@vercel/blob";
import { ok, fail, nowISO } from "@/lib/fetcher";
import { getSql, ensureSchema, hasDb } from "@/lib/db";
import { currentUserId } from "@/lib/auth";
import { isInsideUiwang } from "@/lib/geo";
import type { Photo, PhotosPayload } from "@/lib/photoTypes";

export const dynamic = "force-dynamic";

const EMPTY: PhotosPayload = { photos: [], updatedAt: "" };

/** 한 사람이 올릴 수 있는 사진 수 — 저장소가 무한하지 않다 */
const MAX_PHOTOS = 300;
const MAX_BYTES = 12 * 1024 * 1024;
const ALLOWED = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];

function bad(message: string, status = 400) {
  return Response.json({ ok: false, message }, { status });
}

interface Row {
  id: number;
  url: string;
  caption: string | null;
  lat: number;
  lng: number;
  loc_source: string;
  taken_at: string | null;
  created_at: string;
}

function toPhoto(r: Row): Photo {
  return {
    id: Number(r.id),
    url: r.url,
    caption: r.caption,
    lat: r.lat,
    lng: r.lng,
    locSource: (r.loc_source as Photo["locSource"]) ?? "device",
    takenAt: r.taken_at ? new Date(r.taken_at).toISOString() : null,
    createdAt: new Date(r.created_at).toISOString(),
  };
}

/* ────────────────── 내 사진 목록 ────────────────── */

export async function GET() {
  if (!hasDb()) return fail(EMPTY, "저장소가 연결되지 않았습니다.");
  const userId = await currentUserId();
  // 로그인하지 않았으면 빈 목록. 남의 사진은 어떤 경우에도 보이지 않는다.
  if (!userId) return ok(EMPTY);

  try {
    await ensureSchema();
    const sql = getSql();
    const rows = (await sql`
      SELECT id, url, caption, lat, lng, loc_source, taken_at, created_at
        FROM photos
       WHERE user_id = ${userId}
       ORDER BY COALESCE(taken_at, created_at) DESC
       LIMIT ${MAX_PHOTOS}
    `) as Row[];
    return ok({ photos: rows.map(toPhoto), updatedAt: nowISO() } satisfies PhotosPayload);
  } catch (e) {
    console.error("[photos:get]", e);
    return fail(EMPTY, `사진 조회 실패: ${e instanceof Error ? e.message : e}`);
  }
}

/* ────────────────── 등록 ────────────────── */

export async function POST(req: Request) {
  if (!hasDb()) return bad("저장소가 연결되지 않았습니다.", 503);
  const userId = await currentUserId();
  if (!userId) return bad("로그인이 필요합니다.", 401);

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return bad("요청 형식이 잘못되었습니다.");
  }

  const file = form.get("file");
  if (!(file instanceof File)) return bad("사진이 없습니다.");
  if (file.size === 0) return bad("빈 파일입니다.");
  if (file.size > MAX_BYTES) {
    return bad(`사진이 너무 큽니다 (최대 ${Math.round(MAX_BYTES / 1024 / 1024)}MB).`);
  }
  if (file.type && !ALLOWED.includes(file.type)) {
    return bad("지원하지 않는 이미지 형식입니다.");
  }

  const lat = Number(form.get("lat"));
  const lng = Number(form.get("lng"));
  const locSource = String(form.get("locSource") ?? "device");
  const caption = String(form.get("caption") ?? "").trim().slice(0, 200) || null;
  const takenAtRaw = String(form.get("takenAt") ?? "");

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return bad("위치를 확인할 수 없습니다. 위치 권한을 허용하거나 지도에서 지정해 주세요.");
  }
  // 의왕 포털이므로 의왕 안에서 찍은 사진만 받는다
  if (!isInsideUiwang(lat, lng)) {
    return bad("의왕시 안에서 찍은 사진만 등록할 수 있습니다.", 403);
  }

  try {
    await ensureSchema();
    const sql = getSql();

    const [{ n }] = (await sql`
      SELECT COUNT(*)::int AS n FROM photos WHERE user_id = ${userId}
    `) as { n: number }[];
    if (n >= MAX_PHOTOS) return bad(`사진은 최대 ${MAX_PHOTOS}장까지 보관됩니다.`, 429);

    // 사용자별 폴더에 두고 파일명은 랜덤 접미사에 맡긴다(추측 불가)
    const ext = (file.name.split(".").pop() ?? "jpg").toLowerCase().slice(0, 5);
    const blob = await put(`photos/${userId}/${Date.now()}.${ext}`, file, {
      access: "public",
      addRandomSuffix: true,
      contentType: file.type || "image/jpeg",
    });

    const takenAt = takenAtRaw && !Number.isNaN(Date.parse(takenAtRaw)) ? takenAtRaw : null;

    const [row] = (await sql`
      INSERT INTO photos (user_id, url, pathname, caption, lat, lng, loc_source, taken_at)
      VALUES (${userId}, ${blob.url}, ${blob.pathname}, ${caption}, ${lat}, ${lng},
              ${locSource}, ${takenAt})
      RETURNING id, url, caption, lat, lng, loc_source, taken_at, created_at
    `) as Row[];

    return Response.json(
      { ok: true, photo: toPhoto(row) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    console.error("[photos:post]", e);
    return bad(`사진 등록 실패: ${e instanceof Error ? e.message : e}`, 500);
  }
}

/* ────────────────── 수정 (설명·위치) ────────────────── */

export async function PATCH(req: Request) {
  const userId = await currentUserId();
  if (!userId) return bad("로그인이 필요합니다.", 401);

  const body = (await req.json().catch(() => null)) as {
    id?: number;
    caption?: string;
    lat?: number;
    lng?: number;
  } | null;
  if (!body?.id) return bad("사진을 찾을 수 없습니다.");

  const caption =
    typeof body.caption === "string" ? body.caption.trim().slice(0, 200) || null : undefined;
  const hasCoords = Number.isFinite(body.lat) && Number.isFinite(body.lng);
  if (hasCoords && !isInsideUiwang(Number(body.lat), Number(body.lng))) {
    return bad("의왕시 안에서만 위치를 지정할 수 있습니다.", 403);
  }

  try {
    await ensureSchema();
    const sql = getSql();
    // 소유자 조건을 WHERE 에 두어 남의 사진은 손댈 수 없게 한다
    const rows = (await sql`
      UPDATE photos
         SET caption = COALESCE(${caption ?? null}, caption),
             lat = COALESCE(${hasCoords ? Number(body.lat) : null}, lat),
             lng = COALESCE(${hasCoords ? Number(body.lng) : null}, lng),
             loc_source = CASE WHEN ${hasCoords} THEN 'manual' ELSE loc_source END
       WHERE id = ${body.id} AND user_id = ${userId}
       RETURNING id, url, caption, lat, lng, loc_source, taken_at, created_at
    `) as Row[];
    if (rows.length === 0) return bad("사진을 찾을 수 없습니다.", 404);
    return Response.json({ ok: true, photo: toPhoto(rows[0]) });
  } catch (e) {
    console.error("[photos:patch]", e);
    return bad(`수정 실패: ${e instanceof Error ? e.message : e}`, 500);
  }
}

/* ────────────────── 삭제 ────────────────── */

export async function DELETE(req: Request) {
  const userId = await currentUserId();
  if (!userId) return bad("로그인이 필요합니다.", 401);

  const id = Number(new URL(req.url).searchParams.get("id"));
  if (!Number.isFinite(id)) return bad("사진을 찾을 수 없습니다.");

  try {
    await ensureSchema();
    const sql = getSql();
    const rows = (await sql`
      DELETE FROM photos WHERE id = ${id} AND user_id = ${userId} RETURNING url
    `) as { url: string }[];
    if (rows.length === 0) return bad("사진을 찾을 수 없습니다.", 404);

    // DB 행을 지운 뒤 파일을 지운다. 파일 삭제가 실패해도 목록에서는 이미 사라졌다.
    try {
      await del(rows[0].url);
    } catch (e) {
      console.error("[photos:delete:blob]", e);
    }
    return Response.json({ ok: true });
  } catch (e) {
    console.error("[photos:delete]", e);
    return bad(`삭제 실패: ${e instanceof Error ? e.message : e}`, 500);
  }
}
