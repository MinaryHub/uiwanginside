"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import useSWR from "swr";
import { swrFetcher } from "@/lib/fetcher";
import { useDebounced } from "@/lib/useDebounced";
import { CATEGORY_MAP } from "@/lib/uiwang";
import { Empty } from "@/components/ui";
import type { ApiEnvelope, Place } from "@/lib/types";

/**
 * 이름으로 찾기.
 *
 * 상단 바에 입력칸을 끼워 넣지 않고 버튼 하나로 여닫는다. 휴대폰에서
 * 로고·날씨·버튼 넷이 이미 한 줄을 다 쓰고 있어, 입력칸을 밀어 넣으면
 * 모두가 좁아진다. 찾는 일은 잠깐이고 늘 보일 필요가 없다.
 */
const RECENT_KEY = "uiwang.recent";
const RECENT_MAX = 5;

function readRecent(): Place[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    return raw ? (JSON.parse(raw) as Place[]).slice(0, RECENT_MAX) : [];
  } catch {
    return [];
  }
}

export function pushRecent(p: Place) {
  try {
    const next = [p, ...readRecent().filter((x) => x.id !== p.id)].slice(0, RECENT_MAX);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    /* 저장이 막혀 있어도 검색 자체는 된다 */
  }
}

function Row({ p, onPick }: { p: Place; onPick: (p: Place) => void }) {
  const def = CATEGORY_MAP[p.category];
  return (
    <button
      type="button"
      onClick={() => onPick(p)}
      className="flex w-full items-center gap-2.5 rounded-[var(--radius)] px-2.5 py-2.5 text-left transition hover:bg-[var(--surface-2)]"
    >
      <span
        aria-hidden
        className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-[var(--text-xs)]"
        style={{ background: "var(--surface-2)", color: def?.color }}
      >
        {def?.emoji ?? "📍"}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[var(--text-sm)] font-semibold">{p.name}</span>
        <span className="block truncate text-[var(--text-2xs)] text-[var(--text-muted)]">
          {p.roadAddress || p.address}
        </span>
      </span>
      {p.distance != null && (
        <span className="shrink-0 text-[var(--text-2xs)] font-semibold tabular-nums text-[var(--text-faint)]">
          {p.distance >= 1000 ? `${(p.distance / 1000).toFixed(1)}km` : `${p.distance}m`}
        </span>
      )}
    </button>
  );
}

export default function SearchOverlay({
  center,
  onPick,
  onClose,
}: {
  center: { lat: number; lng: number };
  onPick: (p: Place) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  /*
   * 최근 목록은 처음 그릴 때 한 번 읽는다.
   * 이 오버레이는 버튼을 눌러야 생기므로 그 시점엔 이미 브라우저 안이다.
   */
  const [recent, setRecent] = useState<Place[]>(() =>
    typeof window === "undefined" ? [] : readRecent(),
  );
  const inputRef = useRef<HTMLInputElement>(null);

  // 열리자마자 바로 칠 수 있게
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // 한 글자 칠 때마다 부르면 카카오를 너무 자주 두드린다
  const dq = useDebounced(q.trim(), 300);
  const { data, isLoading } = useSWR<ApiEnvelope<{ places: Place[] }>>(
    dq.length >= 2
      ? `/api/search?q=${encodeURIComponent(dq)}&lat=${center.lat.toFixed(4)}&lng=${center.lng.toFixed(4)}`
      : null,
    swrFetcher,
    { keepPreviousData: true, revalidateOnFocus: false },
  );

  const results = useMemo(() => data?.data.places ?? [], [data]);

  const pick = useCallback(
    (p: Place) => {
      pushRecent(p);
      onPick(p);
      onClose();
    },
    [onPick, onClose],
  );

  const clearRecent = useCallback(() => {
    try {
      localStorage.removeItem(RECENT_KEY);
    } catch {
      /* 지우지 못해도 화면에서는 사라진다 */
    }
    setRecent([]);
  }, []);

  return (
    <div className="absolute inset-0 z-50 flex flex-col bg-[var(--bg)]/70 backdrop-blur-sm">
      <div className="mx-auto flex max-h-full w-full max-w-[520px] flex-col p-3">
        <div className="flex items-center gap-2 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] px-3 shadow-[var(--shadow-lg)]">
          <span aria-hidden className="text-[var(--text-muted)]">
            🔍
          </span>
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") onClose();
              if (e.key === "Enter" && results[0]) pick(results[0]);
            }}
            placeholder="의왕시 안에서 찾기 — 도서관, 우체국, 가게 이름"
            className="min-h-[48px] min-w-0 flex-1 bg-transparent text-[var(--text-base)] outline-none"
          />
          <button
            type="button"
            onClick={onClose}
            aria-label="검색 닫기"
            className="grid h-10 w-10 shrink-0 place-items-center rounded-[var(--radius)] text-[var(--text-muted)] transition hover:bg-[var(--surface-2)]"
          >
            ✕
          </button>
        </div>

        <div className="thin-scroll mt-2 min-h-0 flex-1 overflow-y-auto rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-1.5 shadow-[var(--shadow-lg)]">
          {q.trim().length < 2 ? (
            recent.length > 0 ? (
              <>
                <div className="flex items-center px-2 pb-1 pt-1.5">
                  <p className="text-[var(--text-2xs)] font-bold text-[var(--text-muted)]">
                    최근 본 곳
                  </p>
                  <button
                    type="button"
                    onClick={clearRecent}
                    className="ml-auto text-[var(--text-2xs)] font-semibold text-[var(--text-faint)] underline underline-offset-2"
                  >
                    지우기
                  </button>
                </div>
                {recent.map((p) => (
                  <Row key={p.id} p={p} onPick={pick} />
                ))}
              </>
            ) : (
              <Empty>두 글자 이상 입력하면 찾습니다.</Empty>
            )
          ) : isLoading && results.length === 0 ? (
            <p className="px-2.5 py-4 text-[var(--text-sm)] text-[var(--text-muted)]">
              찾는 중…
            </p>
          ) : results.length === 0 ? (
            <Empty>
              의왕시 안에서 찾지 못했습니다.
              <br />
              이웃 도시에 있는 곳은 나오지 않습니다.
            </Empty>
          ) : (
            results.map((p) => <Row key={p.id} p={p} onPick={pick} />)
          )}
        </div>
      </div>
    </div>
  );
}
