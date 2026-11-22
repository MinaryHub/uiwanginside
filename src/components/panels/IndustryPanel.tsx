"use client";

import { useMemo } from "react";
import { Section, Skeleton, LiveDot, Unavailable } from "@/components/ui";
import {
  FACTORY_SUMMARY,
  INDUSTRY_GROUP_MAP,
  industryGroup,
  summarizeFactories,
  type Tally,
} from "@/lib/factories";
import type { ApiEnvelope, FactoriesPayload, FactoryItem } from "@/lib/types";

const num = (n: number) => n.toLocaleString("ko-KR");

/** 한 줄 막대 — 이름 · 막대 · 수. 막대 길이는 가장 큰 것 기준 */
function Bar({
  t,
  max,
  emoji,
  color,
  active,
  onClick,
}: {
  t: Tally;
  max: number;
  emoji?: string;
  color: string;
  active?: boolean;
  onClick?: () => void;
}) {
  const body = (
    <>
      <span className="flex w-[8.75rem] shrink-0 items-center gap-1.5 truncate text-left font-bold">
        {emoji && <span aria-hidden>{emoji}</span>}
        {t.label}
      </span>
      <span className="relative h-4 min-w-0 flex-1 overflow-hidden rounded-full border-2 border-[var(--ink)] bg-[var(--surface-2)]">
        <span
          className="absolute inset-y-0 left-0 rounded-full"
          style={{ width: `${Math.max(6, (t.count / max) * 100)}%`, background: color }}
        />
      </span>
      <span className="tnum w-12 shrink-0 text-right font-extrabold">{num(t.count)}</span>
    </>
  );
  return (
    <li>
      {onClick ? (
        <button
          type="button"
          onClick={onClick}
          aria-pressed={active}
          className={`flex min-h-[38px] w-full items-center gap-2 rounded-[var(--radius)] px-1.5 py-1.5 text-[length:var(--text-sm)] transition ${
            active ? "bg-[var(--brand-soft)]" : "hover:bg-[var(--surface-2)]"
          }`}
        >
          {body}
        </button>
      ) : (
        <div className="flex items-center gap-2 px-1.5 py-1.5 text-[length:var(--text-sm)]">{body}</div>
      )}
    </li>
  );
}

export default function IndustryPanel({
  res,
  isLoading,
  error,
  onSelectDong,
  activeDong,
  activeGroup,
  onSelectGroup,
  onFocusFactory,
}: {
  res?: ApiEnvelope<FactoriesPayload>;
  isLoading?: boolean;
  error?: unknown;
  onSelectDong: (d: { name: string }) => void;
  activeDong: string | null;
  activeGroup?: string | null;
  onSelectGroup?: (groupId: string | null) => void;
  onFocusFactory?: (f: FactoryItem) => void;
}) {
  const s = useMemo(() => {
    if (res?.ok && res.data.factories.length > 0) {
      return summarizeFactories(res.data.factories, res.data.asOf);
    }
    return FACTORY_SUMMARY;
  }, [res]);

  const mappedCount = useMemo(
    () => (res?.data.factories ?? []).filter((f) => f.lat != null && f.lng != null).length,
    [res],
  );

  if (isLoading && s.total === 0) {
    return (
      <Section title="제조업 분포">
        <Skeleton rows={4} />
      </Section>
    );
  }

  if (s.total === 0) {
    return (
      <Section title="제조업 분포">
        {res?.ok === false || error ? (
          <Unavailable reason={res?.notice} error={error} />
        ) : (
          <div className="rounded-[var(--radius-lg)] border-2 border-dashed border-[var(--border)] p-4 text-center">
            <p aria-hidden className="text-[2rem]">🏭</p>
            <p className="mt-1 font-extrabold">공장 자료를 준비하고 있어요</p>
            <p className="mt-1 text-[length:var(--text-xs)] leading-relaxed text-[var(--text-muted)]">
              경기도 의왕시 공장 현황(공공데이터포털 API)을 연동하면 동별·업종별 분포가 여기에
              나옵니다.
            </p>
          </div>
        )}
      </Section>
    );
  }

  // 업종은 위에서 일곱까지, 나머지는 한 줄로 묶는다 — 길게 늘어놓으면 순위가 안 읽힌다
  const top = s.byGroup.slice(0, 7);
  const rest = s.byGroup.slice(7);
  const restTally: Tally | null = rest.length
    ? {
        key: "rest",
        label: `그 밖 ${rest.length}종`,
        count: rest.reduce((n, t) => n + t.count, 0),
        employees: rest.reduce((n, t) => n + t.employees, 0),
      }
    : null;
  const groupMax = Math.max(1, ...s.byGroup.map((t) => t.count));
  const dongMax = Math.max(1, ...s.byDong.map((t) => t.count));
  const lead = s.byGroup[0] ? INDUSTRY_GROUP_MAP[s.byGroup[0].key] : null;
  const isLive = res?.ok && res.data.source === "odcloud";

  return (
    <Section
      title="제조업 분포"
      right={
        <span className="flex items-center gap-2">
          {isLive && <LiveDot live />}
          {s.asOf && (
            <span className="text-[length:var(--text-2xs)] text-[var(--text-muted)]">
              {s.asOf} 기준
            </span>
          )}
        </span>
      }
    >
      {/* 한눈에 */}
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-[var(--radius)] border-2 border-[var(--ink)] bg-[#e5dbff] p-3 text-[#23201c] shadow-[var(--shadow-sm)]">
          <p className="text-[length:var(--text-2xs)] font-bold opacity-75">등록 공장</p>
          <p className="tnum text-[1.5rem] font-extrabold leading-tight">
            {num(s.total)}
            <span className="text-[length:var(--text-sm)]">곳</span>
          </p>
        </div>
        <div className="rounded-[var(--radius)] border-2 border-[var(--ink)] bg-[#d3f9d8] p-3 text-[#23201c] shadow-[var(--shadow-sm)]">
          <p className="text-[length:var(--text-2xs)] font-bold opacity-75">일하는 사람</p>
          <p className="tnum text-[1.5rem] font-extrabold leading-tight">
            {num(s.employees)}
            <span className="text-[length:var(--text-sm)]">명</span>
          </p>
        </div>
      </div>
      {lead && (
        <p className="mt-2.5 text-[length:var(--text-sm)] font-bold">
          <span aria-hidden>{lead.emoji} </span>
          의왕에서 가장 많은 공장은 <span className="text-[var(--brand)]">{lead.label}</span>이에요
        </p>
      )}

      <div className="mb-1 mt-5 flex items-center gap-2">
        <h3 className="text-[length:var(--text-sm)] font-extrabold">
          업종별
          {onSelectGroup && mappedCount > 0 && (
            <span className="font-semibold text-[var(--text-muted)]"> · 누르면 지도에서 필터</span>
          )}
        </h3>
        {activeGroup && onSelectGroup && (
          <button
            type="button"
            onClick={() => onSelectGroup(null)}
            className="ml-auto text-[length:var(--text-2xs)] font-bold text-[var(--brand)] underline underline-offset-2"
          >
            필터 해제
          </button>
        )}
      </div>
      <ul>
        {top.map((t) => {
          const g = INDUSTRY_GROUP_MAP[t.key];
          return (
            <Bar
              key={t.key}
              t={t}
              max={groupMax}
              emoji={g.emoji}
              color={g.color}
              active={activeGroup === t.key}
              onClick={
                onSelectGroup && mappedCount > 0
                  ? () => onSelectGroup(activeGroup === t.key ? null : t.key)
                  : undefined
              }
            />
          );
        })}
        {restTally && <Bar t={restTally} max={groupMax} emoji="➕" color="#adb5bd" />}
      </ul>

      {s.byDong.length > 0 && (
        <>
          <h3 className="mb-1 mt-5 text-[length:var(--text-sm)] font-extrabold">
            동별 <span className="font-semibold text-[var(--text-muted)]">· 누르면 지도가 그 동으로</span>
          </h3>
          <ul>
            {s.byDong.map((t) => (
              <Bar
                key={t.key}
                t={t}
                max={dongMax}
                color="var(--brand-2)"
                active={activeDong === t.key}
                onClick={() => onSelectDong({ name: t.key })}
              />
            ))}
          </ul>
        </>
      )}

      {s.largest.length > 0 && (
        <>
          <h3 className="mb-1 mt-5 text-[length:var(--text-sm)] font-extrabold">우리 동네 큰 일터</h3>
          <ol className="divide-y-2 divide-dashed divide-[var(--border)]">
            {s.largest.map((f, i) => {
              const g = industryGroup(f.industry);
              const canFocus = !!onFocusFactory && f.lat != null && f.lng != null;
              const inner = (
                <>
                  <span className="tnum w-5 shrink-0 text-center font-extrabold text-[var(--text-muted)]">
                    {i + 1}
                  </span>
                  <span className="min-w-0 flex-1 text-left">
                    <span className="block truncate font-bold">{f.name}</span>
                    <span className="block truncate text-[length:var(--text-2xs)] text-[var(--text-muted)]">
                      <span aria-hidden>{g.emoji} </span>
                      {g.label}
                      {f.dong ? ` · ${f.dong}` : ""}
                    </span>
                  </span>
                  <span className="tnum shrink-0 font-extrabold">{num(f.employees ?? 0)}명</span>
                </>
              );
              return (
                <li key={`${f.name}-${i}`}>
                  {canFocus ? (
                    <button
                      type="button"
                      onClick={() => onFocusFactory(f)}
                      className="flex min-h-[44px] w-full items-center gap-2 rounded-[var(--radius)] px-1 py-2 transition hover:bg-[var(--surface-2)]"
                      title="지도에서 공장 위치 보기"
                    >
                      {inner}
                    </button>
                  ) : (
                    <div className="flex items-center gap-2 px-1 py-2">{inner}</div>
                  )}
                </li>
              );
            })}
          </ol>
        </>
      )}

      <p className="mt-4 text-[length:var(--text-2xs)] leading-relaxed text-[var(--text-faint)]">
        경기도 의왕시 공장 현황(공공데이터포털 Open API). 공장 등록은 건축면적 500㎡ 이상만 의무라
        작은 공장은 빠져 있을 수 있습니다. 지도의 🏭 를 누르면 공장 정보가 나옵니다.
      </p>
    </Section>
  );
}
