"use client";

import { useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import { swrFetcher } from "@/lib/fetcher";
import type { ListsPayload } from "@/lib/listTypes";
import type { ApiEnvelope, Place } from "@/lib/types";

/**
 * 장소를 내 리스트에 담는다.
 *
 * 로그인하지 않았으면 목록이 비어 오므로 로그인 안내만 띄운다.
 * 서버가 소유자를 다시 확인하므로 여기서의 판단은 화면 편의일 뿐이다.
 */
export default function SaveToList({ place }: { place: Place }) {
  const { data } = useSWR<ApiEnvelope<ListsPayload>>("/api/lists", swrFetcher, {
    revalidateOnFocus: false,
  });
  const lists = data?.data.lists ?? [];
  const [open, setOpen] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const save = async (listId: number, title: string) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/lists/${listId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          placeId: place.id,
          name: place.name,
          category: place.category,
          address: place.roadAddress || place.address,
          phone: place.phone,
          lat: place.lat,
          lng: place.lng,
        }),
      });
      const json = (await res.json()) as { ok?: boolean; message?: string };
      setSaved(json.ok ? `${title}에 담았습니다` : (json.message ?? "담지 못했습니다"));
      if (json.ok) setOpen(false);
    } finally {
      setBusy(false);
    }
  };

  if (saved) {
    return (
      <p className="mt-3 text-[var(--text-xs)] font-semibold text-[var(--brand)]">{saved}</p>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-3 inline-flex min-h-[40px] items-center rounded-[var(--radius)] border border-[var(--border-strong)] px-3 text-[var(--text-xs)] font-bold"
      >
        + 내 리스트에 담기
      </button>
    );
  }

  return (
    <div className="mt-3 rounded-[var(--radius)] bg-[var(--surface-2)] p-2.5">
      {lists.length === 0 ? (
        <p className="text-[var(--text-xs)] leading-relaxed text-[var(--text-muted)]">
          담을 리스트가 없습니다.{" "}
          <Link href="/lists" className="font-bold text-[var(--brand)] underline underline-offset-4">
            리스트 만들기
          </Link>
        </p>
      ) : (
        <ul className="space-y-0.5">
          {lists.map((l) => (
            <li key={l.id}>
              <button
                type="button"
                disabled={busy}
                onClick={() => save(l.id, l.title)}
                className="flex min-h-[40px] w-full items-center gap-2 rounded-[6px] px-2 text-left text-[var(--text-xs)] font-semibold transition hover:bg-[var(--surface)] disabled:opacity-50"
              >
                <span className="min-w-0 flex-1 truncate">{l.title}</span>
                <span className="tnum shrink-0 text-[var(--text-2xs)] text-[var(--text-faint)]">
                  {l.itemCount}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
