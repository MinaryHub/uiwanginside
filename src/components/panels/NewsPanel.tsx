"use client";

import { Section, Skeleton, Empty, LiveDot, Unavailable, timeAgo } from "@/components/ui";
import type { NewsPayload, ApiEnvelope } from "@/lib/types";

export default function NewsPanel({
  res,
  isLoading,
  isValidating,
  error,
  query,
  onQueryChange,
}: {
  res?: ApiEnvelope<NewsPayload>;
  isLoading: boolean;
  isValidating?: boolean;
  error?: unknown;
  query: string;
  onQueryChange: (q: string) => void;
}) {
  const d = res?.data;
  const presets = ["의왕시", "의왕 교통", "의왕 사고", "의왕 개발", "왕송호수"];

  return (
    <Section
      title="주요 뉴스"
      right={
        isValidating ? (
          <span className="text-[length:var(--text-2xs)] font-semibold text-[var(--text-muted)]">
            불러오는 중…
          </span>
        ) : (
          <LiveDot live={d?.source === "naver" && !!res?.ok} />
        )
      }
    >
      {isLoading && !d ? (
        <Skeleton rows={4} />
      ) : !res?.ok ? (
        <Unavailable reason={res?.notice} error={error} />
      ) : (
        <>
          <div className="thin-scroll mb-2.5 flex gap-1.5 overflow-x-auto pb-1">
            {presets.map((p) => {
              const on = query === p;
              return (
                <button
                  key={p}
                  type="button"
                  aria-pressed={on}
                  onClick={() => onQueryChange(p)}
                  className={`min-h-[36px] shrink-0 rounded-full border-2 px-3 py-1 text-[length:var(--text-xs)] font-semibold transition ${
                    on ? "shadow-[var(--shadow-sm)]" : "hover:bg-[var(--surface-2)]"
                  }`}
                  style={
                    on
                      ? { background: "var(--brand-2)", borderColor: "var(--ink)", color: "var(--ink)" }
                      : { borderColor: "var(--border)", color: "var(--text-muted)" }
                  }
                >
                  {p}
                </button>
              );
            })}
          </div>

          {d && d.items.length === 0 ? (
            <Empty>검색 결과가 없습니다.</Empty>
          ) : (
            <ul className={`divide-y divide-[var(--border)] transition-opacity ${isValidating ? "opacity-65" : ""}`}>
              {d?.items.slice(0, 12).map((n, i) => (
                <li key={`${n.link}-${i}`}>
                  <a
                    href={n.link}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="block py-2.5 transition hover:opacity-70"
                  >
                    <p className="line-clamp-2 text-[length:var(--text-sm)] font-semibold leading-snug">
                      {n.title}
                    </p>
                    <p className="mt-0.5 line-clamp-1 text-[length:var(--text-xs)] text-[var(--text-muted)]">
                      {n.description}
                    </p>
                    <p className="mt-1 flex items-center gap-1.5 text-[length:var(--text-2xs)] text-[var(--text-muted)]">
                      <span className="font-semibold">{n.source}</span>
                      <span>·</span>
                      <span>{timeAgo(n.publishedAt)}</span>
                    </p>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </Section>
  );
}
