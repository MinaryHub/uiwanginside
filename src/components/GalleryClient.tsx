"use client";

import { useCallback, useState } from "react";
import useSWR from "swr";
import { swrFetcher } from "@/lib/fetcher";
import { Empty, Skeleton } from "@/components/ui";
import PhotoUpload from "@/components/PhotoUpload";
import type { Photo, PhotosPayload } from "@/lib/photoTypes";
import type { ApiEnvelope } from "@/lib/types";

const LOC_LABEL: Record<Photo["locSource"], string> = {
  exif: "촬영 위치",
  device: "등록 위치",
  manual: "직접 지정",
};

function when(p: Photo) {
  const d = new Date(p.takenAt ?? p.createdAt);
  return d.toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "Asia/Seoul",
  });
}

export default function GalleryClient() {
  const { data, isLoading, mutate } = useSWR<ApiEnvelope<PhotosPayload>>(
    "/api/photos",
    swrFetcher,
    { revalidateOnFocus: false },
  );
  const photos = data?.data.photos ?? [];

  const [editing, setEditing] = useState<Photo | null>(null);
  const [caption, setCaption] = useState("");
  const [busy, setBusy] = useState(false);

  /** 목록을 서버에서 다시 받지 않고 그 자리에서 고친다 */
  const patchLocal = useCallback(
    (fn: (list: Photo[]) => Photo[]) => {
      mutate(
        (cur) => cur && { ...cur, data: { ...cur.data, photos: fn(cur.data.photos) } },
        { revalidate: false },
      );
    },
    [mutate],
  );

  const onAdded = useCallback(
    (p: Photo) => patchLocal((list) => [p, ...list]),
    [patchLocal],
  );

  const save = useCallback(async () => {
    if (!editing) return;
    setBusy(true);
    try {
      const res = await fetch("/api/photos", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: editing.id, caption }),
      });
      const json = (await res.json()) as { ok?: boolean; photo?: Photo };
      if (json.ok && json.photo) {
        const updated = json.photo;
        patchLocal((list) => list.map((x) => (x.id === updated.id ? updated : x)));
        setEditing(null);
      }
    } finally {
      setBusy(false);
    }
  }, [editing, caption, patchLocal]);

  const remove = useCallback(
    async (p: Photo) => {
      if (!confirm(`이 사진을 삭제할까요?\n${p.caption ?? when(p)}`)) return;
      // 먼저 화면에서 지우고, 실패하면 되돌린다
      patchLocal((list) => list.filter((x) => x.id !== p.id));
      const res = await fetch(`/api/photos?id=${p.id}`, { method: "DELETE" });
      if (!res.ok) {
        patchLocal((list) => [p, ...list]);
        alert("삭제하지 못했습니다.");
      }
    },
    [patchLocal],
  );

  return (
    <>
      <div className="mb-5">
        <PhotoUpload onAdded={onAdded} />
      </div>

      {isLoading && !data ? (
        <Skeleton rows={4} />
      ) : photos.length === 0 ? (
        <Empty>
          아직 등록한 사진이 없습니다.
          <br />
          의왕 곳곳에서 찍은 사진을 올리면 지도에 표시됩니다.
        </Empty>
      ) : (
        <>
          <p className="mb-2 text-[var(--text-xs)] font-semibold text-[var(--text-muted)]">
            {photos.length}장
          </p>
          <ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
            {photos.map((p) => (
              <li
                key={p.id}
                className="overflow-hidden rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)]"
              >
                {/* 원본이 커서 next/image 대신 blob URL 을 그대로 쓴다 */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={p.url}
                  alt={p.caption ?? "등록한 사진"}
                  loading="lazy"
                  className="aspect-square w-full object-cover"
                />
                <div className="p-2">
                  <p className="truncate text-[var(--text-xs)] font-semibold">
                    {p.caption || when(p)}
                  </p>
                  <p className="mt-0.5 text-[var(--text-2xs)] text-[var(--text-faint)]">
                    {LOC_LABEL[p.locSource]}
                  </p>
                  <div className="mt-1.5 flex gap-1">
                    <button
                      type="button"
                      onClick={() => {
                        setEditing(p);
                        setCaption(p.caption ?? "");
                      }}
                      className="min-h-[36px] flex-1 rounded-[6px] border border-[var(--border-strong)] text-[var(--text-2xs)] font-bold"
                    >
                      수정
                    </button>
                    <button
                      type="button"
                      onClick={() => remove(p)}
                      className="min-h-[36px] flex-1 rounded-[6px] border border-[var(--border-strong)] text-[var(--text-2xs)] font-bold text-[var(--danger)]"
                    >
                      삭제
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

      {editing && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4"
          onClick={() => setEditing(null)}
        >
          <div
            className="w-full max-w-[380px] rounded-[var(--radius-lg)] bg-[var(--surface)] p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="mb-3 text-[var(--text-base)] font-extrabold">사진 수정</h2>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={editing.url}
              alt=""
              className="mb-3 max-h-[220px] w-full rounded-[var(--radius)] object-contain"
            />
            <input
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              maxLength={200}
              placeholder="설명 (선택)"
              className="w-full rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2.5 text-[var(--text-sm)] outline-none focus:border-[var(--brand)]"
            />
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => setEditing(null)}
                className="min-h-[44px] flex-1 rounded-[var(--radius)] border border-[var(--border-strong)] text-[var(--text-sm)] font-bold"
              >
                취소
              </button>
              <button
                type="button"
                onClick={save}
                disabled={busy}
                className="min-h-[44px] flex-1 rounded-[var(--radius)] text-[var(--text-sm)] font-bold disabled:opacity-50"
                style={{ background: "var(--brand)", color: "var(--on-brand)" }}
              >
                저장
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
