import { ok, fail } from "@/lib/fetcher";
import { getSql, ensureSchema, hasDb } from "@/lib/db";
import { auth } from "@/lib/auth";
import { toList, toItem, type ListRow, type ItemRow } from "@/lib/listDb";
import { isInsideUiwang } from "@/lib/geo";
import type { PlaceListDetail } from "@/lib/listTypes";

export const dynamic = "force-dynamic";

const MAX_ITEMS = 200;

function bad(message: string, status = 400) {
  return Response.json({ ok: false, message }, { status });
}

/** 소유자 확인 — 남의 리스트는 손댈 수 없다 */
async function ownedBy(listId: number, userId: string) {
  const sql = getSql();
  const rows = (await sql`
    SELECT id FROM place_lists WHERE id = ${listId} AND user_id = ${userId}
  `) as { id: number }[];
  return rows.length > 0;
}

type Ctx = { params: Promise<{ id: string }> };

/** 리스트 하나 (담긴 장소 포함) */
export async function GET(_req: Request, ctx: Ctx) {
  if (!hasDb()) return fail(null, "저장소가 연결되지 않았습니다.");
  const userId = (await auth())?.user?.id;
  if (!userId) return fail(null, "로그인이 필요합니다.");
  const id = Number((await ctx.params).id);

  try {
    await ensureSchema();
    const sql = getSql();
    const rows = (await sql`
      SELECT l.id, l.title, l.description, l.share_slug, l.owner_name, l.updated_at,
             (SELECT COUNT(*) FROM place_list_items i WHERE i.list_id = l.id)::int AS item_count
        FROM place_lists l
       WHERE l.id = ${id} AND l.user_id = ${userId}
    `) as ListRow[];
    if (rows.length === 0) return fail(null, "리스트를 찾을 수 없습니다.");

    const items = (await sql`
      SELECT id, place_id, name, category, address, phone, lat, lng, note
        FROM place_list_items WHERE list_id = ${id}
       ORDER BY sort_order, created_at
    `) as ItemRow[];

    return ok({
      ...toList(rows[0]),
      ownerName: rows[0].owner_name ?? null,
      items: items.map(toItem),
    } satisfies PlaceListDetail);
  } catch (e) {
    console.error("[list:get]", e);
    return fail(null, `조회 실패: ${e instanceof Error ? e.message : e}`);
  }
}

/** 장소 담기 */
export async function POST(req: Request, ctx: Ctx) {
  const userId = (await auth())?.user?.id;
  if (!userId) return bad("로그인이 필요합니다.", 401);
  const listId = Number((await ctx.params).id);

  const b = (await req.json().catch(() => null)) as {
    placeId?: string;
    name?: string;
    category?: string;
    address?: string;
    phone?: string;
    lat?: number;
    lng?: number;
    note?: string;
  } | null;

  if (!b?.placeId || !b.name || !b.category) return bad("장소 정보가 없습니다.");
  const lat = Number(b.lat);
  const lng = Number(b.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return bad("좌표가 없습니다.");
  if (!isInsideUiwang(lat, lng)) return bad("의왕시 안의 장소만 담을 수 있습니다.", 403);

  try {
    await ensureSchema();
    if (!(await ownedBy(listId, userId))) return bad("리스트를 찾을 수 없습니다.", 404);
    const sql = getSql();

    const [{ n }] = (await sql`
      SELECT COUNT(*)::int AS n FROM place_list_items WHERE list_id = ${listId}
    `) as { n: number }[];
    if (n >= MAX_ITEMS) return bad(`한 리스트에 ${MAX_ITEMS}곳까지 담을 수 있습니다.`, 429);

    // 같은 장소를 두 번 담아도 쌓이지 않고 메모만 갱신된다
    const rows = (await sql`
      INSERT INTO place_list_items
        (list_id, place_id, name, category, address, phone, lat, lng, note, sort_order)
      VALUES (${listId}, ${b.placeId}, ${b.name.slice(0, 120)}, ${b.category},
              ${b.address?.slice(0, 200) ?? null}, ${b.phone?.slice(0, 40) ?? null},
              ${lat}, ${lng}, ${b.note?.slice(0, 200) ?? null}, ${n})
      ON CONFLICT (list_id, place_id) DO UPDATE SET note = EXCLUDED.note
      RETURNING id, place_id, name, category, address, phone, lat, lng, note
    `) as ItemRow[];

    await sql`UPDATE place_lists SET updated_at = now() WHERE id = ${listId}`;
    return Response.json({ ok: true, item: toItem(rows[0]) });
  } catch (e) {
    console.error("[list:post]", e);
    return bad(`담지 못했습니다: ${e instanceof Error ? e.message : e}`, 500);
  }
}

/** 담긴 장소 빼기 */
export async function DELETE(req: Request, ctx: Ctx) {
  const userId = (await auth())?.user?.id;
  if (!userId) return bad("로그인이 필요합니다.", 401);
  const listId = Number((await ctx.params).id);
  const placeId = new URL(req.url).searchParams.get("placeId");
  if (!placeId) return bad("장소를 찾을 수 없습니다.");

  try {
    await ensureSchema();
    if (!(await ownedBy(listId, userId))) return bad("리스트를 찾을 수 없습니다.", 404);
    const sql = getSql();
    await sql`
      DELETE FROM place_list_items WHERE list_id = ${listId} AND place_id = ${placeId}
    `;
    await sql`UPDATE place_lists SET updated_at = now() WHERE id = ${listId}`;
    return Response.json({ ok: true });
  } catch (e) {
    console.error("[list:delete]", e);
    return bad(`빼지 못했습니다: ${e instanceof Error ? e.message : e}`, 500);
  }
}
