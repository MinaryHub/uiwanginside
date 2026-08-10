"use client";

import { useCallback, useRef, useState } from "react";
import { isInsideUiwang, MAX_ACCURACY_M } from "@/lib/geo";
import type { Photo } from "@/lib/photoTypes";

/**
 * 사진 등록.
 *
 * 최대한 적게 묻는 것이 목표다. 사진을 고르면 바로 올라가고, 설명은
 * 선택이다. 위치는 이 순서로 정한다.
 *   1) 사진에 박힌 촬영 위치(EXIF GPS) — 가장 정확하고 아무것도 묻지 않는다
 *   2) 지금 내 위치 — 방금 찍은 사진이면 사실상 같다
 * 둘 다 없으면 등록을 막고 이유를 알린다. 위치를 지어내지 않는다.
 */
export default function PhotoUpload({
  onAdded,
  compact,
}: {
  onAdded: (p: Photo) => void;
  compact?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);

  /** 사진에서 촬영 위치·시각을 뽑는다. 없으면 null */
  const readExif = useCallback(async (file: File) => {
    try {
      // exifr 은 무겁지 않지만 필요할 때만 불러온다
      const exifr = (await import("exifr")).default;
      const data = (await exifr.parse(file, {
        gps: true,
        pick: ["latitude", "longitude", "DateTimeOriginal", "CreateDate"],
      })) as
        | { latitude?: number; longitude?: number; DateTimeOriginal?: Date; CreateDate?: Date }
        | undefined;
      if (!data) return null;
      const taken = data.DateTimeOriginal ?? data.CreateDate ?? null;
      return {
        lat: typeof data.latitude === "number" ? data.latitude : null,
        lng: typeof data.longitude === "number" ? data.longitude : null,
        takenAt: taken instanceof Date ? taken.toISOString() : null,
      };
    } catch {
      return null;
    }
  }, []);

  /** 현재 위치. 거부되거나 오차가 크면 null */
  const currentLocation = useCallback(
    () =>
      new Promise<{ lat: number; lng: number } | null>((resolve) => {
        if (typeof navigator === "undefined" || !navigator.geolocation) return resolve(null);
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            const { latitude, longitude, accuracy } = pos.coords;
            resolve(accuracy <= MAX_ACCURACY_M ? { lat: latitude, lng: longitude } : null);
          },
          () => resolve(null),
          { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
        );
      }),
    [],
  );

  const upload = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0) return;
      setBusy(true);
      setMessage(null);

      let added = 0;
      let failed = 0;

      for (const [i, file] of Array.from(files).entries()) {
        setProgress(files.length > 1 ? `${i + 1} / ${files.length}` : null);

        const exif = await readExif(file);
        let lat = exif?.lat ?? null;
        let lng = exif?.lng ?? null;
        let locSource: Photo["locSource"] = "exif";

        if (lat === null || lng === null) {
          const here = await currentLocation();
          if (!here) {
            failed++;
            setMessage(
              "사진에 위치 정보가 없고 현재 위치도 확인할 수 없습니다. 위치 권한을 허용해 주세요.",
            );
            continue;
          }
          lat = here.lat;
          lng = here.lng;
          locSource = "device";
        }

        if (!isInsideUiwang(lat, lng)) {
          failed++;
          setMessage("의왕시 안에서 찍은 사진만 등록할 수 있습니다.");
          continue;
        }

        const fd = new FormData();
        fd.set("file", file);
        fd.set("lat", String(lat));
        fd.set("lng", String(lng));
        fd.set("locSource", locSource);
        if (exif?.takenAt) fd.set("takenAt", exif.takenAt);

        try {
          const res = await fetch("/api/photos", { method: "POST", body: fd });
          const json = (await res.json()) as { ok?: boolean; message?: string; photo?: Photo };
          if (!res.ok || !json.ok || !json.photo) {
            failed++;
            setMessage(json.message ?? "사진을 올리지 못했습니다.");
          } else {
            added++;
            onAdded(json.photo);
          }
        } catch {
          failed++;
          setMessage("네트워크 오류로 올리지 못했습니다.");
        }
      }

      setProgress(null);
      setBusy(false);
      if (added > 0 && failed === 0) setMessage(`${added}장 등록했습니다.`);
      else if (added > 0) setMessage(`${added}장 등록, ${failed}장 실패했습니다.`);
      if (inputRef.current) inputRef.current.value = "";
    },
    [readExif, currentLocation, onAdded],
  );

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => upload(e.target.files)}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        className={`inline-flex min-h-[48px] items-center justify-center gap-2 rounded-[var(--radius)] text-[var(--text-base)] font-extrabold transition disabled:opacity-50 ${
          compact ? "px-4" : "w-full"
        }`}
        style={{ background: "var(--brand)", color: "var(--on-brand)" }}
      >
        {busy ? `올리는 중${progress ? ` ${progress}` : ""}…` : "사진 등록"}
      </button>

      {message && (
        <p className="mt-2 text-[var(--text-xs)] leading-relaxed text-[var(--text-muted)]">
          {message}
        </p>
      )}
      {!busy && !message && (
        <p className="mt-2 text-[var(--text-2xs)] leading-relaxed text-[var(--text-faint)]">
          여러 장을 한 번에 고를 수 있습니다. 사진에 촬영 위치가 있으면 그대로 쓰고,
          없으면 지금 내 위치로 등록합니다.
        </p>
      )}
    </div>
  );
}
