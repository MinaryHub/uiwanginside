import type { CategoryKey } from "./uiwang";

export interface ListItem {
  id: number;
  placeId: string;
  name: string;
  category: CategoryKey;
  address: string | null;
  phone: string | null;
  lat: number;
  lng: number;
  note: string | null;
}

export interface PlaceList {
  id: number;
  title: string;
  description: string | null;
  /** 있으면 공유 중. /list/{slug} 로 누구나 볼 수 있다 */
  shareSlug: string | null;
  itemCount: number;
  updatedAt: string;
}

export interface PlaceListDetail extends PlaceList {
  ownerName: string | null;
  items: ListItem[];
}

export interface ListsPayload {
  lists: PlaceList[];
}
