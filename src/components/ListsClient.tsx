"use client";

import { useCallback, useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import { swrFetcher } from "@/lib/fetcher";
import { Empty, Skeleton } from "@/components/ui";
import type { ListsPayload, PlaceList } from "@/lib/listTypes";
import type { ApiEnvelope } from "@/lib/types";

export default function ListsClient() {
  const { data, isLoading, mutate } = useSWR<ApiEnvelope<ListsPayload>>(
    "/api/lists",
    swrFetcher,
    { revalidateOnFocus: false },
  );
  const lists = data?.data.lists ?? [];
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState<number | null>(null);

  const create = useCallback(async () => {
    const t = title.trim();
    if (!t) return;
    setBusy(true);
    try {
      const res = await fetch("/api/lists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: t }),
      });
      const json = (await res.json()) as { ok?: boolean; list?: PlaceList };
      if (json.ok && json.list) {
        const created = json.list;
        mutate(
          (cur) => cur && { ...cur, data: { lists: [created, ...cur.data.lists] } },
          { revalidate: false },
        );
        setTitle("");
      }
    } finally {
      setBusy(false);
    }
  }, [title, mutate]);

  const patch = useCallback(
    async (id: number, body: Record<string, unknown>) => {
      const res = await fetch("/api/lists", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...body }),
      });
      const json = (await res.json()) as { ok?: boolean; list?: PlaceList };
      if (json.ok && json.list) {
        const next = json.list;
        mutate(
          (cur) =>
            cur && {
              ...cur,
              data: { lists: cur.data.lists.map((l) => (l.id === next.id ? next : l)) },
            },
          { revalidate: false },
        );
        return next;
      }
      return null;
    },
    [mutate],
  );

  const remove = useCallback(
    async (l: PlaceList) => {
      if (!confirm(`"${l.title}" 리스트를 삭제할까요?\n담긴 장소도 함께 사라집니다.`)) return;
      mutate(
        (cur) => cur && { ...cur, data: { lists: cur.data.lists.filter((x) => x.id !== l.id) } },
        { revalidate: false },
      );
      const res = await fetch(`/api/lists?id=${l.id}`, { method: "DELETE" });
      if (!res.ok) mutate();
    },
    [mutate],
  );

  const shareUrl = (slug: string) =>
    typeof window === "undefined" ? "" : `${window.location.origin}/list/${slug}`;

  return (
    <>
      <div className="mb-5 flex gap-2">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && create()}
          maxLength={60}
          placeholder="리스트 이름 (예: 의왕 카페 지도)"
          className="min-h-[48px] flex-1 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface-2)] px-3 text-[var(--text-sm)] outline-none focus:border-[var(--brand)]"
        />
        <button
          type="button"
          onClick={create}
          disabled={busy || !title.trim()}
          className="min-h-[48px] shrink-0 rounded-[var(--radius)] px-4 text-[var(--text-sm)] font-extrabold disabled:opacity-45"
          style={{ background: "var(--brand)", color: "var(--on-brand)" }}
        >
          만들기
        </button>
      </div>

      {isLoading && !data ? (
        <Skeleton rows={3} />
      ) : lists.length === 0 ? (
        <Empty>
          아직 리스트가 없습니다.
          <br />
          이름을 짓고 만들면, 지도에서 장소를 눌러 담을 수 있습니다.
        </Empty>
      ) : (
        <ul className="divide-y divide-[var(--border)]">
          {lists.map((l) => (
            <li key={l.id} className="py-3.5">
              <div className="flex items-baseline gap-2">
                <h2 className="min-w-0 flex-1 truncate text-[var(--text-base)] font-bold">
                  {l.title}
                </h2>
                <span className="tnum shrink-0 text-[var(--text-xs)] text-[var(--text-muted)]">
                  {l.itemCount}곳
                </span>
              </div>

              <div className="mt-2 flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => patch(l.id, { share: !l.shareSlug })}
                  className="min-h-[38px] rounded-[var(--radius)] border px-3 text-[var(--text-2xs)] font-bold"
                  style={
                    l.shareSlug
                      ? { borderColor: "var(--brand)", color: "var(--brand)" }
                      : { borderColor: "var(--border-strong)" }
                  }
                >
                  {l.shareSlug ? "공유 중" : "공유하기"}
                </button>

                {l.shareSlug && (
                  <>
                    <button
                      type="button"
                      onClick={async () => {
                        const url = shareUrl(l.shareSlug!);
                        try {
                          if (navigator.share) await navigator.share({ title: l.title, url });
                          else await navigator.clipboard.writeText(url);
                          setCopied(l.id);
                          setTimeout(() => setCopied(null), 1800);
                        } catch {
                          /* 취소한 경우 */
                        }
                      }}
                      className="min-h-[38px] rounded-[var(--radius)] px-3 text-[var(--text-2xs)] font-bold"
                      style={{ background: "var(--brand)", color: "var(--on-brand)" }}
                    >
                      {copied === l.id ? "복사됨" : "링크 보내기"}
                    </button>
                    <Link
                      href={`/list/${l.shareSlug}`}
                      className="inline-flex min-h-[38px] items-center rounded-[var(--radius)] border border-[var(--border-strong)] px-3 text-[var(--text-2xs)] font-bold"
                    >
                      미리보기
                    </Link>
                  </>
                )}

                <button
                  type="button"
                  onClick={() => remove(l)}
                  className="ml-auto min-h-[38px] rounded-[var(--radius)] border border-[var(--border-strong)] px-3 text-[var(--text-2xs)] font-bold text-[var(--danger)]"
                >
                  삭제
                </button>
              </div>

              {l.shareSlug && (
                <p className="mt-1.5 break-all text-[var(--text-2xs)] text-[var(--text-faint)]">
                  링크를 아는 사람은 로그인 없이 볼 수 있습니다. 공유를 끄면 즉시 막힙니다.
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
