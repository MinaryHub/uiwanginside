"use client";

import { useMemo, useState } from "react";
import { Section, Skeleton, Empty, LiveDot, Unavailable } from "@/components/ui";
import type { ApiEnvelope, LocalCurrencyMerchant, LocalCurrencyPayload } from "@/lib/types";

type CatFilter = "all" | LocalCurrencyMerchant["category"];

const CATS: [CatFilter, string][] = [
  ["all", "전체"],
  ["food", "음식점"],
  ["cafe", "카페·빵"],
  ["mart", "마트·식품"],
  ["medical", "병·약국"],
  ["life", "생활·기타"],
];

export default function LocalCurrencyPanel({
  res,
  isLoading,
  error,
  defaultCategory = "all",
  onSelect,
}: {
  res?: ApiEnvelope<LocalCurrencyPayload>;
  isLoading: boolean;
  error?: unknown;
  defaultCategory?: CatFilter;
  onSelect: (m: LocalCurrencyMerchant) => void;
}) {
  const [cat, setCat] = useState<CatFilter>(defaultCategory);
  const [keyword, setKeyword] = useState("");
  const [limit, setLimit] = useState(20);

  const merchants = useMemo(() => res?.data.merchants ?? [], [res]);

  const filtered = useMemo(() => {
    const q = keyword.trim().toLowerCase();
    return merchants.filter((m) => {
      if (cat !== "all" && m.category !== cat) return false;
      if (q) {
        const hay = `${m.name} ${m.industry} ${m.address} ${m.dong}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [merchants, cat, keyword]);

  const visible = filtered.slice(0, limit);
  const more = filtered.length - visible.length;

  return (
    <Section
      title="의왕사랑상품권 가맹점"
      right={<LiveDot live={!!res?.ok && merchants.length > 0} />}
    >
      {isLoading && !res ? (
        <Skeleton rows={3} />
      ) : !res?.ok ? (
        <Unavailable reason={res?.notice} error={error} />
      ) : (
        <>
          <div className="mb-2 flex items-center justify-between text-[length:var(--text-2xs)] text-[var(--text-muted)]">
            <span>
              의왕시 등록{" "}
              <b className="tnum text-[var(--text)]">
                {(res.data.totalCount || merchants.length).toLocaleString("ko-KR")}곳
              </b>{" "}
              중 {filtered.length.toLocaleString("ko-KR")}곳 표시
            </span>
          </div>

          <div className="mb-2 flex flex-wrap gap-1">
            {CATS.map(([k, label]) => {
              const on = cat === k;
              return (
                <button
                  key={k}
                  type="button"
                  aria-pressed={on}
                  onClick={() => {
                    setCat(k);
                    setLimit(20);
                  }}
                  className={`min-h-[34px] rounded-[var(--radius-full)] border-2 px-2.5 text-[length:var(--text-2xs)] font-bold transition ${
                    on
                      ? "border-[var(--ink)] shadow-[var(--shadow-sm)]"
                      : "border-transparent bg-[var(--surface-2)] text-[var(--text-muted)] hover:bg-[var(--surface-3)]"
                  }`}
                  style={on ? { background: "var(--brand-2)", color: "var(--ink)" } : undefined}
                >
                  {label}
                </button>
              );
            })}
          </div>

          <input
            value={keyword}
            type="search"
            inputMode="search"
            enterKeyHint="search"
            aria-label="의왕사랑상품권 가맹점 이름·업종·동 검색"
            onChange={(e) => {
              setKeyword(e.target.value);
              setLimit(20);
            }}
            placeholder="가게 이름, 업종, 동 이름으로 찾기"
            className="mb-2 min-h-[44px] w-full rounded-[var(--radius-full)] border border-transparent bg-[var(--surface-2)] px-3.5 text-[16px] outline-none transition focus:border-[var(--brand-2)] focus:bg-[var(--surface)] sm:text-[length:var(--text-xs)]"
          />

          {visible.length === 0 ? (
            <Empty>조건에 맞는 의왕사랑상품권 가맹점이 없습니다.</Empty>
          ) : (
            <>
              <ul className="thin-scroll max-h-[260px] space-y-1 overflow-y-auto overscroll-contain">
                {visible.map((m) => (
                  <li key={m.id}>
                    <button
                      type="button"
                      onClick={() => onSelect(m)}
                      className="flex min-h-[48px] w-full items-start gap-2 rounded-[var(--radius)] bg-[var(--surface-2)] px-2.5 py-2 text-left transition hover:bg-[var(--surface-3)]"
                    >
                      <span aria-hidden className="mt-0.5 text-base leading-none">
                        💳
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5">
                          <span className="truncate text-[length:var(--text-sm)] font-bold">
                            {m.name}
                          </span>
                          {m.dong && (
                            <span className="shrink-0 rounded bg-[var(--surface)] px-1.5 text-[11px] font-semibold text-[var(--text-muted)]">
                              {m.dong}
                            </span>
                          )}
                        </span>
                        <span className="mt-0.5 block truncate text-[length:var(--text-2xs)] text-[var(--text-muted)]">
                          {[m.industry, m.address].filter(Boolean).join(" · ")}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
              {more > 0 && (
                <button
                  type="button"
                  onClick={() => setLimit((n) => n + 30)}
                  className="mt-2 min-h-[42px] w-full rounded-[var(--radius)] bg-[var(--surface-2)] text-[length:var(--text-xs)] font-bold text-[var(--text-muted)] hover:bg-[var(--surface-3)]"
                >
                  {more}곳 더 보기
                </button>
              )}
            </>
          )}
        </>
      )}
    </Section>
  );
}
