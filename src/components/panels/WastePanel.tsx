"use client";

import { useState, useSyncExternalStore } from "react";
import { Section } from "@/components/ui";
import {
  WASTE_KINDS,
  DISCHARGE_WINDOW,
  COLLECTION_TIME,
  WASTE_CONTACT,
  HAS_DONG_SCHEDULE,
} from "@/lib/waste";

const noopSubscribe = () => () => {};

/** 6~8월(한국 시각 기준)은 하절기 수거 시간 적용 */
function isKstSummer() {
  const kstMonth = new Date(Date.now() + 9 * 3600_000).getUTCMonth() + 1;
  return kstMonth >= 6 && kstMonth <= 8;
}

export default function WastePanel() {
  const [open, setOpen] = useState<string | null>(null);
  const summer = useSyncExternalStore(noopSubscribe, isKstSummer, () => false);

  return (
    <Section title="쓰레기 배출">
      {/* 배출 시간 — 시민이 가장 자주 확인하는 정보라 맨 위에 크게 */}
      <div className="mb-3 rounded-[var(--radius)] bg-[var(--brand-soft)] px-3 py-2.5">
        <div className="text-[length:var(--text-2xs)] font-bold text-[var(--text-muted)]">배출 가능 시간</div>
        <div className="mt-0.5 text-[length:var(--text-sm)] font-bold text-[var(--brand)]">
          {DISCHARGE_WINDOW.label}
        </div>
        <div className="mt-1 text-[length:var(--text-xs)] text-[var(--text-muted)]">
          수거 {summer ? COLLECTION_TIME.summer : COLLECTION_TIME.normal}
          {summer && " (하절기)"}
        </div>
      </div>

      <ul className="space-y-1.5">
        {WASTE_KINDS.map((k) => {
          const isOpen = open === k.id;
          return (
            <li key={k.id}>
              <button
                type="button"
                onClick={() => setOpen(isOpen ? null : k.id)}
                className="w-full rounded-[var(--radius)] bg-[var(--surface-2)] px-2.5 py-2.5 text-left transition hover:brightness-95"
                aria-expanded={isOpen}
              >
                <div className="flex items-center gap-2">
                  <span
                    aria-hidden
                    className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-[length:var(--text-sm)]"
                    style={{ background: `${k.color}20` }}
                  >
                    {k.emoji}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-[length:var(--text-sm)] font-bold">{k.label}</div>
                    <div className="truncate text-[length:var(--text-xs)] text-[var(--text-muted)]">
                      {k.container}
                    </div>
                  </div>
                  <span aria-hidden className="shrink-0 text-[length:var(--text-2xs)] text-[var(--text-muted)]">
                    {isOpen ? "▲" : "▼"}
                  </span>
                </div>
                {isOpen && (
                  <ul className="mt-1.5 space-y-1 border-t border-[var(--border)] pl-8 pt-1.5">
                    {k.notes.map((n) => (
                      <li key={n} className="text-[length:var(--text-xs)] leading-snug text-[var(--text-muted)]">
                        · {n}
                      </li>
                    ))}
                  </ul>
                )}
              </button>
            </li>
          );
        })}
      </ul>

      <div className="mt-2.5 flex gap-1.5">
        <a
          href={WASTE_CONTACT.bulkyUrl}
          target="_blank"
          rel="noreferrer noopener"
          className="brand-fill press flex min-h-[44px] flex-1 items-center justify-center rounded-[var(--radius)] border-2 px-2 text-center text-[length:var(--text-xs)] font-bold shadow-[var(--shadow-sm)]"
        >
          대형폐기물 신청 ↗
        </a>
        <a
          href={`tel:${WASTE_CONTACT.phone}`}
          className="press flex min-h-[44px] items-center justify-center rounded-[var(--radius)] border-2 border-[var(--ink)] bg-[var(--surface)] px-3 text-[length:var(--text-xs)] font-bold shadow-[var(--shadow-sm)]"
        >
          <span aria-hidden>📞 </span>
          {WASTE_CONTACT.phone}
        </a>
      </div>

      {!HAS_DONG_SCHEDULE && (
        <p className="mt-2.5 rounded-[var(--radius)] bg-[var(--warn-soft)] px-2.5 py-1.5 text-[length:var(--text-xs)] leading-snug text-[var(--warn)]">
          동별 수거 요일은 의왕시가 공개하지 않아 표시할 수 없습니다. 우리 동 요일은{" "}
          {WASTE_CONTACT.dept}({WASTE_CONTACT.phone}) 또는 관리사무소에 확인하세요.
        </p>
      )}

      <p className="mt-2 text-[length:var(--text-2xs)] text-[var(--text-muted)]">
        출처:{" "}
        <a
          href={WASTE_CONTACT.guideUrl}
          target="_blank"
          rel="noreferrer noopener"
          className="underline underline-offset-2"
        >
          의왕시청 생활쓰레기 안내
        </a>
      </p>
    </Section>
  );
}
