import { ok, fail } from "@/lib/fetcher";
import { getSql, ensureSchema, hasDb } from "@/lib/db";
import { auth } from "@/lib/auth";
import { toList, makeSlug } from "@/lib/listDb";
import type { ListsPayload } from "@/lib/listTypes";
import type { ListRow } from "@/lib/listDb";

export const dynamic = "force-dynamic";

const EMPTY: ListsPayload = { lists: [] };
const MAX_LISTS = 50;

function bad(message: string, status = 400) {
  return Response.json({ ok: false, message }, { status });
}

/** 내 리스트 목록 */
export async function GET() {
  if (!hasDb()) return fail(EMPTY, "저장소가 연결되지 않았습니다.");
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return ok(EMPTY);

  try {
    await ensureSchema();
    const sql = getSql();
    const rows = (await sql`
      SELECT l.id, l.title, l.description, l.share_slug, l.updated_at,
             (SELECT COUNT(*) FROM place_list_items i WHERE i.list_id = l.id)::int AS item_count
        FROM place_lists l
       WHERE l.user_id = ${userId}
       ORDER BY l.updated_at DESC
    `) as ListRow[];
    return ok({ lists: rows.map(toList) } satisfies ListsPayload);
  } catch (e) {
    console.error("[lists:get]", e);
    return fail(EMPTY, `목록 조회 실패: ${e instanceof Error ? e.message : e}`);
  }
}

/** 리스트 만들기 */
export async function POST(req: Request) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return bad("로그인이 필요합니다.", 401);

  const body = (await req.json().catch(() => null)) as {
    title?: string;
    description?: string;
  } | null;
  const title = (body?.title ?? "").trim().slice(0, 60);
  if (!title) return bad("리스트 이름을 입력해 주세요.");
  const description = (body?.description ?? "").trim().slice(0, 200) || null;

  try {
    await ensureSchema();
    const sql = getSql();
    const [{ n }] = (await sql`
      SELECT COUNT(*)::int AS n FROM place_lists WHERE user_id = ${userId}
    `) as { n: number }[];
    if (n >= MAX_LISTS) return bad(`리스트는 최대 ${MAX_LISTS}개까지 만들 수 있습니다.`, 429);

    const rows = (await sql`
      INSERT INTO place_lists (user_id, owner_name, title, description)
      VALUES (${userId}, ${session.user.name ?? null}, ${title}, ${description})
      RETURNING id, title, description, share_slug, updated_at, 0 AS item_count
    `) as ListRow[];
    return Response.json({ ok: true, list: toList(rows[0]) });
  } catch (e) {
    console.error("[lists:post]", e);
    return bad(`만들지 못했습니다: ${e instanceof Error ? e.message : e}`, 500);
  }
}

/** 이름·설명 수정, 공유 켜기/끄기 */
export async function PATCH(req: Request) {
  const userId = (await auth())?.user?.id;
  if (!userId) return bad("로그인이 필요합니다.", 401);

  const body = (await req.json().catch(() => null)) as {
    id?: number;
    title?: string;
    description?: string;
    share?: boolean;
  } | null;
  if (!body?.id) return bad("리스트를 찾을 수 없습니다.");

  const title = typeof body.title === "string" ? body.title.trim().slice(0, 60) : undefined;
  const description =
    typeof body.description === "string"
      ? body.description.trim().slice(0, 200) || null
      : undefined;

  try {
    await ensureSchema();
    const sql = getSql();

    // 공유를 켜면 slug 를 만들고, 끄면 지운다. 끄는 즉시 기존 링크가 무효가 된다.
    let slugSql: string | null | undefined;
    if (body.share === true) slugSql = makeSlug();
    else if (body.share === false) slugSql = null;

    const rows = (await sql`
      UPDATE place_lists
         SET title = COALESCE(${title ?? null}, title),
             description = CASE WHEN ${description !== undefined}
                                THEN ${description ?? null} ELSE description END,
             share_slug = CASE
               WHEN ${body.share === true} THEN ${slugSql ?? null}
               WHEN ${body.share === false} THEN NULL
               ELSE share_slug END,
             updated_at = now()
       WHERE id = ${body.id} AND user_id = ${userId}
       RETURNING id, title, description, share_slug, updated_at,
                 (SELECT COUNT(*) FROM place_list_items i WHERE i.list_id = place_lists.id)::int AS item_count
    `) as ListRow[];
    if (rows.length === 0) return bad("리스트를 찾을 수 없습니다.", 404);
    return Response.json({ ok: true, list: toList(rows[0]) });
  } catch (e) {
    console.error("[lists:patch]", e);
    return bad(`수정 실패: ${e instanceof Error ? e.message : e}`, 500);
  }
}

/** 리스트 삭제 — 담긴 장소는 ON DELETE CASCADE 로 함께 지워진다 */
export async function DELETE(req: Request) {
  const userId = (await auth())?.user?.id;
  if (!userId) return bad("로그인이 필요합니다.", 401);
  const id = Number(new URL(req.url).searchParams.get("id"));
  if (!Number.isFinite(id)) return bad("리스트를 찾을 수 없습니다.");

  try {
    await ensureSchema();
    const sql = getSql();
    const rows = (await sql`
      DELETE FROM place_lists WHERE id = ${id} AND user_id = ${userId} RETURNING id
    `) as { id: number }[];
    if (rows.length === 0) return bad("리스트를 찾을 수 없습니다.", 404);
    return Response.json({ ok: true });
  } catch (e) {
    console.error("[lists:delete]", e);
    return bad(`삭제 실패: ${e instanceof Error ? e.message : e}`, 500);
  }
}
