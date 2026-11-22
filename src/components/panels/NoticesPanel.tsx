"use client";

import { useMemo, useState } from "react";
import { Section, Skeleton, Empty, Badge, LiveDot, Unavailable, timeAgo } from "@/components/ui";
import type { ApiEnvelope, CityNoticeKind, NoticesPayload } from "@/lib/types";

const KIND_META: Record<CityNoticeKind, { label: string; tone: "brand" | "info" | "ok" }> = {
  event: { label: "행사·문화", tone: "brand" },
  recruit: { label: "모집·지원", tone: "ok" },
  notice: { label: "시정·공지", tone: "info" },
};

const QUICK_LINKS = [
  { label: "시청 공지사항", url: "https://www.uiwang.go.kr/UWKORINFO0101" },
  { label: "의왕도시공사 예약", url: "https://reserve.uuc.or.kr" },
  { label: "의왕시도서관", url: "https://www.uwlib.or.kr" },
];

export default function NoticesPanel({
  res,
  isLoading,
  error,
}: {
  res?: ApiEnvelope<NoticesPayload>;
  isLoading: boolean;
  error?: unknown;
}) {
  const [tab, setTab] = useState<CityNoticeKind | "all">("all");
  const items = useMemo(() => res?.data.items ?? [], [res]);

  const filtered = useMemo(
    () => (tab === "all" ? items : items.filter((it) => it.kind === tab)),
    [items, tab],
  );

  return (
    <Section
      title="의왕시 행사 · 시정 소식"
      right={<LiveDot live={!!res?.ok && items.length > 0} />}
    >
      {/* 공식 누리집 바로가기 */}
      <div className="mb-3 flex flex-wrap gap-1.5">
        {QUICK_LINKS.map((l) => (
          <a
            key={l.url}
            href={l.url}
            target="_blank"
            rel="noreferrer noopener"
            className="press inline-flex min-h-[36px] items-center rounded-full border-2 border-[var(--ink)] bg-[var(--surface-2)] px-3 text-[length:var(--text-2xs)] font-bold shadow-[var(--shadow-sm)]"
          >
            {l.label} ↗
          </a>
        ))}
      </div>

      {isLoading && !res ? (
        <Skeleton rows={3} />
      ) : !res?.ok ? (
        <Unavailable reason={res?.notice} error={error} />
      ) : (
        <>
          <div className="mb-2.5 flex flex-wrap gap-1">
            {(["all", "event", "recruit", "notice"] as const).map((k) => {
              const on = tab === k;
              const label = k === "all" ? `전체 ${items.length}` : KIND_META[k].label;
              return (
                <button
                  key={k}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setTab(k)}
                  className={`min-h-[34px] rounded-full border-2 px-2.5 py-0.5 text-[length:var(--text-2xs)] font-bold transition ${
                    on
                      ? "border-[var(--ink)] shadow-[var(--shadow-sm)]"
                      : "border-transparent text-[var(--text-muted)] hover:bg-[var(--surface-2)]"
                  }`}
                  style={on ? { background: "var(--brand-2)", color: "var(--ink)" } : undefined}
                >
                  {label}
                </button>
              );
            })}
          </div>

          {filtered.length === 0 ? (
            <Empty>해당 분류의 최근 소식이 없습니다.</Empty>
          ) : (
            <ul className="divide-y divide-[var(--border)]">
              {filtered.slice(0, 10).map((it) => {
                const meta = KIND_META[it.kind];
                return (
                  <li key={it.id}>
                    <a
                      href={it.url}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="block py-2.5 transition hover:opacity-75"
                    >
                      <div className="mb-1 flex items-center gap-1.5">
                        <Badge tone={meta.tone}>{meta.label}</Badge>
                        {it.period && (
                          <span className="truncate text-[length:var(--text-2xs)] font-semibold text-[var(--text-muted)]">
                            {it.period}
                          </span>
                        )}
                        {!it.period && (
                          <span className="ml-auto shrink-0 text-[length:var(--text-2xs)] text-[var(--text-faint)]">
                            {timeAgo(it.publishedAt)}
                          </span>
                        )}
                      </div>
                      <p className="line-clamp-2 text-[length:var(--text-sm)] font-bold leading-snug">
                        {it.title}
                      </p>
                      {(it.place || it.summary) && (
                        <p className="mt-0.5 line-clamp-1 text-[length:var(--text-xs)] text-[var(--text-muted)]">
                          {[it.place, it.fee, it.summary].filter(Boolean).join(" · ")}
                        </p>
                      )}
                      <p className="mt-0.5 text-[length:var(--text-2xs)] text-[var(--text-faint)]">
                        {it.source}
                      </p>
                    </a>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </Section>
  );
}
