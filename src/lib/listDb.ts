import { getSql, ensureSchema } from "./db";
import type { PlaceList, PlaceListDetail, ListItem } from "./listTypes";
import type { CategoryKey } from "./uiwang";

export interface ListRow {
  id: number;
  title: string;
  description: string | null;
  share_slug: string | null;
  item_count: number;
  updated_at: string;
  owner_name?: string | null;
}

export interface ItemRow {
  id: number;
  place_id: string;
  name: string;
  category: string;
  address: string | null;
  phone: string | null;
  lat: number;
  lng: number;
  note: string | null;
}

export function toList(r: ListRow): PlaceList {
  return {
    id: Number(r.id),
    title: r.title,
    description: r.description,
    shareSlug: r.share_slug,
    itemCount: Number(r.item_count ?? 0),
    updatedAt: new Date(r.updated_at).toISOString(),
  };
}

export function toItem(r: ItemRow): ListItem {
  return {
    id: Number(r.id),
    placeId: r.place_id,
    name: r.name,
    category: r.category as CategoryKey,
    address: r.address,
    phone: r.phone,
    lat: r.lat,
    lng: r.lng,
    note: r.note,
  };
}

/** 공유용 짧은 주소. 추측이 어렵도록 충분히 길게 잡는다. */
export function makeSlug(): string {
  const alphabet = "abcdefghijkmnpqrstuvwxyz23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

/** 공유 슬러그로 리스트를 읽는다. 로그인 없이 열람 가능한 유일한 경로다. */
export async function getSharedList(slug: string): Promise<PlaceListDetail | null> {
  await ensureSchema();
  const sql = getSql();
  const rows = (await sql`
    SELECT l.id, l.title, l.description, l.share_slug, l.owner_name, l.updated_at,
           (SELECT COUNT(*) FROM place_list_items i WHERE i.list_id = l.id)::int AS item_count
      FROM place_lists l
     WHERE l.share_slug = ${slug}
  `) as ListRow[];
  if (rows.length === 0) return null;

  const items = (await sql`
    SELECT id, place_id, name, category, address, phone, lat, lng, note
      FROM place_list_items
     WHERE list_id = ${rows[0].id}
     ORDER BY sort_order, created_at
  `) as ItemRow[];

  return {
    ...toList(rows[0]),
    ownerName: rows[0].owner_name ?? null,
    items: items.map(toItem),
  };
}
