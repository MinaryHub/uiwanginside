"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Empty, Skeleton } from "@/components/ui";
import { isInsideUiwang, MAX_ACCURACY_M } from "@/lib/geo";
import type { Photo } from "@/lib/photoTypes";

const SHARE_CACHE = "uiwang-share-v1";

type Stage =
  | { s: "loading" }
  | { s: "none" }
  | { s: "ready"; files: File[] }
  | { s: "uploading"; done: number; total: number }
  | { s: "result"; added: number; failed: number; reason?: string };

/**
 * 폰 갤러리에서 공유받은 사진을 등록한다.
 *
 * 서비스워커가 공유 POST 를 가로채 Cache Storage 에 넣어두면
 * 여기서 꺼내 위치를 붙여 올린다. 사용자가 할 일은 확인 한 번뿐이다.
 */
export default function SharedIntake() {
  const [stage, setStage] = useState<Stage>({ s: "loading" });

  /**
   * 서비스워커가 캐시에 넣어둔 공유 파일을 꺼낸다.
   * 외부 저장소(Cache Storage)에서 읽어오는 일이라 effect 가 맞다.
   */
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        if (typeof caches === "undefined") {
          if (alive) setStage({ s: "none" });
          return;
        }
        const cache = await caches.open(SHARE_CACHE);
        const keys = await cache.keys();
        const files: File[] = [];
        for (const k of keys) {
          const res = await cache.match(k);
          if (!res) continue;
          const blob = await res.blob();
          const name = decodeURIComponent(res.headers.get("X-File-Name") ?? "shared.jpg");
          files.push(new File([blob], name, { type: blob.type || "image/jpeg" }));
        }
        if (alive) setStage(files.length ? { s: "ready", files } : { s: "none" });
      } catch {
        if (alive) setStage({ s: "none" });
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const clearCache = useCallback(async () => {
    try {
      const cache = await caches.open(SHARE_CACHE);
      for (const k of await cache.keys()) await cache.delete(k);
    } catch {
      /* 지우지 못해도 다음 공유 때 서비스워커가 비운다 */
    }
  }, []);

  const upload = useCallback(
    async (files: File[]) => {
      setStage({ s: "uploading", done: 0, total: files.length });

      // 위치는 한 번만 물어 모든 사진에 함께 쓴다.
      // 공유는 대개 방금 찍은 사진들이라 위치가 같다.
      const here = await new Promise<{ lat: number; lng: number } | null>((resolve) => {
        if (typeof navigator === "undefined" || !navigator.geolocation) return resolve(null);
        navigator.geolocation.getCurrentPosition(
          (p) =>
            resolve(
              p.coords.accuracy <= MAX_ACCURACY_M
                ? { lat: p.coords.latitude, lng: p.coords.longitude }
                : null,
            ),
          () => resolve(null),
          { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
        );
      });

      const exifr = (await import("exifr")).default;
      let added = 0;
      let failed = 0;
      let reason: string | undefined;

      for (const [i, file] of files.entries()) {
        setStage({ s: "uploading", done: i, total: files.length });

        let lat: number | null = null;
        let lng: number | null = null;
        let locSource: Photo["locSource"] = "exif";
        let takenAt: string | null = null;

        try {
          const d = (await exifr.parse(file, {
            gps: true,
            pick: ["latitude", "longitude", "DateTimeOriginal"],
          })) as { latitude?: number; longitude?: number; DateTimeOriginal?: Date } | undefined;
          if (typeof d?.latitude === "number" && typeof d?.longitude === "number") {
            lat = d.latitude;
            lng = d.longitude;
          }
          if (d?.DateTimeOriginal instanceof Date) takenAt = d.DateTimeOriginal.toISOString();
        } catch {
          /* EXIF 가 없으면 아래에서 현위치를 쓴다 */
        }

        if (lat === null || lng === null) {
          if (!here) {
            failed++;
            reason = "사진에 위치가 없고 현재 위치도 확인할 수 없습니다.";
            continue;
          }
          lat = here.lat;
          lng = here.lng;
          locSource = "device";
        }

        if (!isInsideUiwang(lat, lng)) {
          failed++;
          reason = "의왕시 안에서 찍은 사진만 등록할 수 있습니다.";
          continue;
        }

        const fd = new FormData();
        fd.set("file", file);
        fd.set("lat", String(lat));
        fd.set("lng", String(lng));
        fd.set("locSource", locSource);
        if (takenAt) fd.set("takenAt", takenAt);

        try {
          const res = await fetch("/api/photos", { method: "POST", body: fd });
          const json = (await res.json()) as { ok?: boolean; message?: string };
          if (res.ok && json.ok) added++;
          else {
            failed++;
            reason = json.message ?? reason;
          }
        } catch {
          failed++;
          reason = "네트워크 오류로 올리지 못했습니다.";
        }
      }

      await clearCache();
      setStage({ s: "result", added, failed, reason });
    },
    [clearCache],
  );

  if (stage.s === "loading") return <Skeleton rows={2} />;

  if (stage.s === "none") {
    return (
      <div>
        <Empty>공유받은 사진이 없습니다.</Empty>
        <div className="rounded-[var(--radius)] bg-[var(--surface-2)] p-4 text-[var(--text-xs)] leading-relaxed text-[var(--text-muted)]">
          <p className="mb-2 font-bold text-[var(--text)]">폰에서 바로 올리는 방법</p>
          <p>
            브라우저 메뉴에서 <b>홈 화면에 추가</b>로 이 앱을 설치하면, 갤러리에서 사진을
            고르고 <b>공유 → 의왕</b>을 누르는 것만으로 등록됩니다.
          </p>
          <p className="mt-2 text-[var(--text-faint)]">
            설치하지 않으면 공유 목록에 나타나지 않습니다. 그때는 갤러리 화면의 사진 등록
            버튼을 쓰세요.
          </p>
        </div>
        <Link
          href="/gallery"
          className="mt-4 inline-flex min-h-[44px] items-center rounded-[var(--radius)] px-4 text-[var(--text-sm)] font-bold"
          style={{ background: "var(--brand)", color: "var(--on-brand)" }}
        >
          갤러리로
        </Link>
      </div>
    );
  }

  if (stage.s === "uploading") {
    return (
      <p className="py-8 text-center text-[var(--text-sm)] font-semibold">
        올리는 중… {stage.done + 1} / {stage.total}
      </p>
    );
  }

  if (stage.s === "result") {
    return (
      <div className="py-6 text-center">
        <p className="text-[var(--text-lg)] font-extrabold">
          {stage.added > 0 ? `${stage.added}장 등록했습니다` : "등록하지 못했습니다"}
        </p>
        {stage.failed > 0 && (
          <p className="mt-2 text-[var(--text-xs)] leading-relaxed text-[var(--text-muted)]">
            {stage.failed}장 실패{stage.reason ? ` — ${stage.reason}` : ""}
          </p>
        )}
        <div className="mt-5 flex justify-center gap-2">
          <Link
            href="/"
            className="inline-flex min-h-[44px] items-center rounded-[var(--radius)] border border-[var(--border-strong)] px-4 text-[var(--text-sm)] font-bold"
          >
            지도에서 보기
          </Link>
          <Link
            href="/gallery"
            className="inline-flex min-h-[44px] items-center rounded-[var(--radius)] px-4 text-[var(--text-sm)] font-bold"
            style={{ background: "var(--brand)", color: "var(--on-brand)" }}
          >
            갤러리
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div>
      <p className="mb-3 text-[var(--text-sm)] font-semibold">
        {stage.files.length}장을 받았습니다. 등록할까요?
      </p>
      <ul className="mb-4 grid grid-cols-3 gap-2">
        {stage.files.slice(0, 9).map((f, i) => (
          <li key={i} className="overflow-hidden rounded-[var(--radius)]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={URL.createObjectURL(f)}
              alt=""
              className="aspect-square w-full object-cover"
            />
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={() => upload(stage.files)}
        className="inline-flex min-h-[48px] w-full items-center justify-center rounded-[var(--radius)] text-[var(--text-base)] font-extrabold"
        style={{ background: "var(--brand)", color: "var(--on-brand)" }}
      >
        이 위치에 등록
      </button>
      <p className="mt-2 text-[var(--text-2xs)] leading-relaxed text-[var(--text-faint)]">
        사진에 촬영 위치가 있으면 그대로 쓰고, 없으면 지금 내 위치로 등록합니다.
      </p>
    </div>
  );
}
