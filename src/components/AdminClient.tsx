"use client";

import { useMemo } from "react";
import useSWR from "swr";
import { Skeleton, Empty, Notice } from "@/components/ui";
import type { ApiEnvelope } from "@/lib/types";
import type { StatsPayload, StatsSummary, Bucket, NamedCount } from "@/lib/statsTypes";

async function fetcher(url: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as ApiEnvelope<StatsPayload>;
}

const DEVICE_LABEL: Record<string, string> = {
  mobile: "휴대폰",
  tablet: "태블릿",
  desktop: "PC",
  unknown: "알 수 없음",
};

const PATH_LABEL: Record<string, string> = {
  "/": "지도 (첫 화면)",
  "/status": "연동 상태",
  "/opendata": "공공데이터 안내",
  "/stats/[token]": "접속 통계 (비밀 주소)",
};

function num(n: number) {
  return n.toLocaleString("ko-KR");
}

/** 어제 대비 증감 */
function Delta({ now, before }: { now: number; before: number }) {
  if (before === 0) return null;
  const pct = Math.round(((now - before) / before) * 100);
  if (pct === 0) return <span className="text-[var(--text-faint)]">＝</span>;
  const up = pct > 0;
  return (
    <span style={{ color: up ? "var(--ok)" : "var(--danger)" }}>
      {up ? "▲" : "▼"} {Math.abs(pct)}%
    </span>
  );
}

function Card({
  label,
  sum,
  before,
}: {
  label: string;
  sum: StatsSummary;
  before?: StatsSummary;
}) {
  return (
    <div className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-3.5">
      <p className="text-[length:var(--text-2xs)] font-bold text-[var(--text-muted)]">{label}</p>
      <p className="mt-1 flex items-baseline gap-1.5 text-[length:var(--text-2xl)] font-bold tabular-nums leading-none">
        {num(sum.visitors)}
        <span className="text-[length:var(--text-2xs)] font-bold text-[var(--text-muted)]">명</span>
        {before && (
          <span className="ml-auto text-[length:var(--text-2xs)] font-bold">
            <Delta now={sum.visitors} before={before.visitors} />
          </span>
        )}
      </p>
      <p className="mt-1.5 text-[length:var(--text-2xs)] text-[var(--text-muted)] tabular-nums">
        {num(sum.views)}회 열람 · {num(sum.sessions)}번 방문
      </p>
    </div>
  );
}

/** 막대 그래프 — 값이 큰 것을 100% 로 잡는다 */
function Bars({ data, empty }: { data: Bucket[]; empty: string }) {
  const max = useMemo(() => Math.max(1, ...data.map((d) => d.views)), [data]);
  if (data.length === 0) return <Empty>{empty}</Empty>;
  return (
    <div className="flex items-end gap-[3px] overflow-x-auto pb-1" style={{ height: 120 }}>
      {data.map((d) => (
        <div
          key={d.label}
          title={`${d.label} · ${num(d.views)}회 열람, ${num(d.visitors)}명`}
          className="flex min-w-[10px] flex-1 flex-col justify-end"
          style={{ height: "100%" }}
        >
          <div
            className="rounded-t-[3px]"
            style={{
              height: `${Math.max(2, (d.views / max) * 100)}%`,
              background: "var(--brand)",
            }}
          />
          {/*
            눈금이 빽빽하면 못 읽는다. 일정 간격으로만, 그것도 뒤쪽만
            적는다 ("08/15 16시" → "16시"). 타이포 스케일 밖의 크기를
            쓰지 않으려면 글자를 줄이는 대신 개수를 줄여야 한다.
          */}
          <span className="mt-1 truncate text-center text-[length:var(--text-2xs)] text-[var(--text-faint)]">
            {data.indexOf(d) % Math.max(1, Math.ceil(data.length / 6)) === 0
              ? d.label.split(" ").pop()
              : ""}
          </span>
        </div>
      ))}
    </div>
  );
}

function Ranking({
  rows,
  empty,
  label,
}: {
  rows: NamedCount[];
  empty: string;
  label?: (name: string) => string;
}) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  if (rows.length === 0) return <Empty>{empty}</Empty>;
  return (
    <ul className="space-y-1.5">
      {rows.map((r) => (
        <li key={r.name || "(없음)"}>
          <div className="flex items-baseline gap-2">
            <span className="flex-1 truncate text-[length:var(--text-sm)] font-semibold">
              {label ? label(r.name) : r.name || "(없음)"}
            </span>
            <span className="shrink-0 text-[length:var(--text-2xs)] tabular-nums text-[var(--text-muted)]">
              {num(r.visitors)}명 · {num(r.count)}회
            </span>
          </div>
          <div className="mt-1 h-[3px] rounded-full bg-[var(--surface-2)]">
            <div
              className="h-full rounded-full"
              style={{ width: `${(r.count / max) * 100}%`, background: "var(--brand)" }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-4">
      <h2 className="text-[length:var(--text-base)] font-bold">{title}</h2>
      {hint && (
        <p className="mb-2.5 mt-0.5 text-[length:var(--text-2xs)] text-[var(--text-muted)]">{hint}</p>
      )}
      <div className={hint ? "" : "mt-2.5"}>{children}</div>
    </section>
  );
}

export default function AdminClient({
  /** 통계를 어디서 받을지 — 토큰이 붙은 비밀 주소 */
  endpoint,
}: {
  endpoint: string;
}) {
  const { data, isLoading } = useSWR<ApiEnvelope<StatsPayload>>(
    endpoint,
    fetcher,
    { refreshInterval: 60_000, revalidateOnFocus: true, shouldRetryOnError: false },
  );

  if (isLoading && !data) return <Skeleton rows={8} />;
  if (!data) return <Empty>통계를 불러오지 못했습니다.</Empty>;
  if (!data.ok) return <Notice>{data.notice}</Notice>;

  const s = data.data;
  const noData = s.last30.views === 0;

  return (
    <div className="space-y-3">
      {noData && (
        <Notice>
          아직 쌓인 접속 기록이 없습니다. 이 화면은 방문이 생기는 대로 채워집니다.
        </Notice>
      )}

      <div className="flex items-center gap-2">
        <span
          aria-hidden
          className="h-2 w-2 rounded-full"
          style={{ background: s.now > 0 ? "var(--ok)" : "var(--border-strong)" }}
        />
        <p className="text-[length:var(--text-sm)] font-bold">
          지금 보고 있는 사람 {num(s.now)}명
        </p>
        <span className="text-[length:var(--text-2xs)] text-[var(--text-faint)]">최근 5분</span>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Card label="오늘" sum={s.today} before={s.yesterday} />
        <Card label="어제" sum={s.yesterday} />
        <Card label="최근 7일" sum={s.last7} />
        <Card label="최근 30일" sum={s.last30} />
      </div>

      <Section title="시간대별" hint="최근 24시간 · 막대에 손을 올리면 정확한 수가 나옵니다">
        <Bars data={s.hourly} empty="최근 24시간 안에 접속이 없습니다." />
      </Section>

      <Section title="날짜별" hint="최근 30일">
        <Bars data={s.daily} empty="아직 날짜별로 보여줄 만큼 쌓이지 않았습니다." />
      </Section>

      <div className="grid gap-3 md:grid-cols-2">
        <Section title="무엇을 보러 오는가" hint="첫 화면에서 고른 목적">
          <Ranking rows={s.modes} empty="아직 기록이 없습니다." />
        </Section>
        <Section title="화면별" hint="최근 30일">
          <Ranking
            rows={s.paths}
            empty="아직 기록이 없습니다."
            label={(p) => PATH_LABEL[p] ?? p}
          />
        </Section>
        <Section title="어디서 들어오는가" hint="주소를 직접 치거나 앱에서 열면 잡히지 않습니다">
          <Ranking rows={s.referrers} empty="외부에서 들어온 기록이 없습니다." />
        </Section>
        <Section title="기기" hint="최근 30일">
          <Ranking
            rows={s.devices}
            empty="아직 기록이 없습니다."
            label={(d) => DEVICE_LABEL[d] ?? d}
          />
        </Section>
      </div>

      <p className="px-1 text-[length:var(--text-2xs)] leading-relaxed text-[var(--text-faint)]">
        {s.since
          ? `${new Date(s.since).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}부터 기록`
          : "아직 기록 없음"}
        {" · 1분마다 새로고침 · 모든 시각은 한국 시각"}
        <br />
        IP·브라우저 정보는 저장하지 않습니다. 방문자 구분은 브라우저가
        스스로 만든 임의의 값으로만 하며, 지우면 새 방문자가 됩니다.
      </p>
    </div>
  );
}
