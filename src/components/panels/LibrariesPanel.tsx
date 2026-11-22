"use client";

import { Section, Skeleton, Empty, LiveDot, Unavailable } from "@/components/ui";
import type { ApiEnvelope, LibrariesPayload, LibraryItem } from "@/lib/types";

const num = (n: number) => n.toLocaleString("ko-KR");

export default function LibrariesPanel({
  res,
  isLoading,
  error,
  onSelect,
}: {
  res?: ApiEnvelope<LibrariesPayload>;
  isLoading: boolean;
  error?: unknown;
  onSelect: (lib: LibraryItem) => void;
}) {
  const libraries = res?.data.libraries ?? [];

  return (
    <Section
      title="의왕시 공공도서관"
      right={<LiveDot live={!!res?.ok && libraries.length > 0} />}
    >
      {isLoading && !res ? (
        <Skeleton rows={3} />
      ) : !res?.ok ? (
        <Unavailable reason={res?.notice} error={error} />
      ) : libraries.length === 0 ? (
        <Empty>표시할 도서관 정보가 없습니다.</Empty>
      ) : (
        <>
          <ul className="space-y-1.5">
            {libraries.map((lib) => {
              const clickable = lib.lat != null && lib.lng != null;
              return (
                <li
                  key={lib.id}
                  className="rounded-[var(--radius)] bg-[var(--surface-2)] p-2.5"
                >
                  <button
                    type="button"
                    disabled={!clickable}
                    onClick={() => clickable && onSelect(lib)}
                    className="w-full text-left disabled:cursor-default"
                  >
                    <div className="flex items-center gap-1.5">
                      <span aria-hidden>📚</span>
                      <span className="min-w-0 flex-1 truncate text-[length:var(--text-sm)] font-bold">
                        {lib.name}
                      </span>
                      {lib.seats != null && (
                        <span className="tnum shrink-0 rounded-full bg-[var(--surface)] px-2 py-0.5 text-[length:var(--text-2xs)] font-bold text-[var(--text-muted)]">
                          좌석 {num(lib.seats)}
                        </span>
                      )}
                    </div>
                    {(lib.weekdayHours || lib.closedDays) && (
                      <p className="mt-1 pl-5 text-[length:var(--text-2xs)] text-[var(--text-muted)]">
                        {lib.weekdayHours && <span>평일 {lib.weekdayHours}</span>}
                        {lib.weekendHours && <span> · 주말 {lib.weekendHours}</span>}
                        {lib.closedDays && (
                          <span className="text-[var(--warn)]"> · 휴관 {lib.closedDays}</span>
                        )}
                      </p>
                    )}
                    {lib.address && (
                      <p className="mt-0.5 truncate pl-5 text-[length:var(--text-2xs)] text-[var(--text-faint)]">
                        {lib.address}
                      </p>
                    )}
                  </button>

                  {(lib.phone || lib.homepage) && (
                    <div className="mt-1.5 flex flex-wrap gap-1.5 pl-5">
                      {lib.phone && (
                        <a
                          href={`tel:${lib.phone}`}
                          className="inline-flex min-h-[34px] items-center rounded-full border border-[var(--border-strong)] bg-[var(--surface)] px-2.5 text-[length:var(--text-2xs)] font-semibold"
                        >
                          📞 {lib.phone}
                        </a>
                      )}
                      {lib.homepage && (
                        <a
                          href={lib.homepage}
                          target="_blank"
                          rel="noreferrer noopener"
                          className="inline-flex min-h-[34px] items-center rounded-full border border-[var(--border-strong)] bg-[var(--surface)] px-2.5 text-[length:var(--text-2xs)] font-semibold"
                        >
                          누리집 ↗
                        </a>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
          <p className="mt-2 text-[length:var(--text-2xs)] text-[var(--text-faint)]">
            <a
              href="https://www.uwlib.or.kr"
              target="_blank"
              rel="noreferrer noopener"
              className="underline underline-offset-2"
            >
              의왕시도서관 통합 누리집(uwlib.or.kr) ↗
            </a>
          </p>
        </>
      )}
    </Section>
  );
}
