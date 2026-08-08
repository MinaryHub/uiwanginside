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
      <div className="mb-3 rounded-lg bg-[var(--brand-soft)] px-3 py-2.5">
        <div className="text-[10.5px] font-bold text-[var(--muted)]">배출 가능 시간</div>
        <div className="mt-0.5 text-[14px] font-extrabold text-[var(--brand)]">
          {DISCHARGE_WINDOW.label}
        </div>
        <div className="mt-1 text-[11px] text-[var(--muted)]">
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
                className="w-full rounded-lg bg-[var(--surface-2)] px-2.5 py-2 text-left transition hover:brightness-95"
                aria-expanded={isOpen}
              >
                <div className="flex items-center gap-2">
                  <span
                    className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-[13px]"
                    style={{ background: `${k.color}20` }}
                  >
                    {k.emoji}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-[12.5px] font-bold">{k.label}</div>
                    <div className="truncate text-[11px] text-[var(--muted)]">
                      {k.container}
                    </div>
                  </div>
                  <span className="shrink-0 text-[10px] text-[var(--muted)]">
                    {isOpen ? "▲" : "▼"}
                  </span>
                </div>
                {isOpen && (
                  <ul className="mt-1.5 space-y-1 border-t border-[var(--border)] pt-1.5 pl-8">
                    {k.notes.map((n) => (
                      <li key={n} className="text-[11.5px] leading-snug text-[var(--muted)]">
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
          className="flex-1 rounded-lg bg-[var(--brand)] px-2 py-1.5 text-center text-[11.5px] font-bold text-white"
        >
          대형폐기물 신청 ↗
        </a>
        <a
          href={`tel:${WASTE_CONTACT.phone}`}
          className="rounded-lg border border-[var(--border)] px-2 py-1.5 text-[11.5px] font-bold"
        >
          📞 {WASTE_CONTACT.phone}
        </a>
      </div>

      {!HAS_DONG_SCHEDULE && (
        <p className="mt-2.5 rounded-lg bg-amber-500/10 px-2.5 py-1.5 text-[11px] leading-snug text-amber-700 dark:text-amber-300">
          동별 수거 요일은 의왕시가 공개하지 않아 표시할 수 없습니다. 우리 동 요일은{" "}
          {WASTE_CONTACT.dept}({WASTE_CONTACT.phone}) 또는 관리사무소에 확인하세요.
        </p>
      )}

      <p className="mt-2 text-[10px] text-[var(--muted)]">
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
