"use client";

import { Card, Skeleton, Empty, LiveDot, Unavailable, timeAgo } from "@/components/ui";
import type { NewsPayload, ApiEnvelope } from "@/lib/types";

export default function NewsPanel({
  res,
  isLoading,
  query,
  onQueryChange,
}: {
  res?: ApiEnvelope<NewsPayload>;
  isLoading: boolean;
  query: string;
  onQueryChange: (q: string) => void;
}) {
  const d = res?.data;
  const presets = ["의왕시", "의왕 교통", "의왕 사고", "의왕 개발", "왕송호수"];

  return (
    <Card title="주요 뉴스" icon="📰" right={<LiveDot live={d?.source === "naver"} />}>
      {isLoading && !d ? (
        <Skeleton rows={4} />
      ) : res?.ok === false ? (
        <Unavailable reason={res.notice} />
      ) : (
        <>
          <div className="thin-scroll mb-2.5 flex gap-1 overflow-x-auto pb-1">
            {presets.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => onQueryChange(p)}
                className="shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-semibold transition"
                style={
                  query === p
                    ? { background: "var(--brand)", borderColor: "var(--brand)", color: "#fff" }
                    : { borderColor: "var(--border)", color: "var(--muted)" }
                }
              >
                {p}
              </button>
            ))}
          </div>

          {d && d.items.length === 0 ? (
            <Empty>검색 결과가 없습니다.</Empty>
          ) : (
            <ul className="divide-y divide-[var(--border)]">
              {d?.items.slice(0, 12).map((n, i) => (
                <li key={`${n.link}-${i}`}>
                  <a
                    href={n.link}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="block py-2 transition hover:opacity-70"
                  >
                    <p className="line-clamp-2 text-[12.5px] font-semibold leading-snug">
                      {n.title}
                    </p>
                    <p className="mt-0.5 line-clamp-1 text-[11px] text-[var(--muted)]">
                      {n.description}
                    </p>
                    <p className="mt-1 flex items-center gap-1.5 text-[10.5px] text-[var(--muted)]">
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
    </Card>
  );
}
