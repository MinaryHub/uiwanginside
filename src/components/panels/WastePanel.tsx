"use client";

import { useState } from "react";
import { Card } from "@/components/ui";
import {
  WASTE_KINDS,
  DISCHARGE_WINDOW,
  COLLECTION_TIME,
  WASTE_CONTACT,
  HAS_DONG_SCHEDULE,
} from "@/lib/waste";

/** 6~8월은 하절기 수거 시간 적용 */
function isSummer() {
  const m = new Date().getMonth() + 1;
  return m >= 6 && m <= 8;
}

export default function WastePanel() {
  const [open, setOpen] = useState<string | null>(null);
  const summer = isSummer();

  return (
    <Card title="쓰레기 배출" icon="🗑️">
      {/* 배출 시간 — 시민이 가장 자주 확인하는 정보라 맨 위에 크게 */}
      <div className="mb-3 rounded-[var(--radius)] bg-[var(--brand-soft)] px-3 py-2.5">
        <div className="text-[var(--text-2xs)] font-bold text-[var(--text-muted)]">배출 가능 시간</div>
        <div className="mt-0.5 text-[var(--text-sm)] font-extrabold text-[var(--brand)]">
          {DISCHARGE_WINDOW.label}
        </div>
        <div className="mt-1 text-[var(--text-xs)] text-[var(--text-muted)]">
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
                className="w-full rounded-[var(--radius)] bg-[var(--surface-2)] px-2.5 py-2 text-left transition hover:brightness-95"
                aria-expanded={isOpen}
              >
                <div className="flex items-center gap-2">
                  <span
                    className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-[var(--text-sm)]"
                    style={{ background: `${k.color}20` }}
                  >
                    {k.emoji}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-[var(--text-sm)] font-bold">{k.label}</div>
                    <div className="truncate text-[var(--text-xs)] text-[var(--text-muted)]">
                      {k.container}
                    </div>
                  </div>
                  <span className="shrink-0 text-[var(--text-2xs)] text-[var(--text-muted)]">
                    {isOpen ? "▲" : "▼"}
                  </span>
                </div>
                {isOpen && (
                  <ul className="mt-1.5 space-y-1 border-t border-[var(--border)] pt-1.5 pl-8">
                    {k.notes.map((n) => (
                      <li key={n} className="text-[var(--text-xs)] leading-snug text-[var(--text-muted)]">
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
          className="flex-1 rounded-[var(--radius)] bg-[var(--brand)] px-2 py-1.5 text-center text-[var(--text-xs)] font-bold text-[var(--on-brand)]"
        >
          대형폐기물 신청 ↗
        </a>
        <a
          href={`tel:${WASTE_CONTACT.phone}`}
          className="rounded-[var(--radius)] border border-[var(--border)] px-2 py-1.5 text-[var(--text-xs)] font-bold"
        >
          📞 {WASTE_CONTACT.phone}
        </a>
      </div>

      {!HAS_DONG_SCHEDULE && (
        <p className="mt-2.5 rounded-[var(--radius)] bg-[var(--warn-soft)] px-2.5 py-1.5 text-[var(--text-xs)] leading-snug text-[var(--warn)]">
          동별 수거 요일은 의왕시가 공개하지 않아 표시할 수 없습니다. 우리 동 요일은{" "}
          {WASTE_CONTACT.dept}({WASTE_CONTACT.phone}) 또는 관리사무소에 확인하세요.
        </p>
      )}

      <p className="mt-2 text-[var(--text-2xs)] text-[var(--text-muted)]">
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
    </Card>
  );
}
