"use client";

import useSWR from "swr";
import { swrFetcher } from "@/lib/fetcher";
import type { ApiEnvelope } from "@/lib/types";
import type { SchoolFacts as Facts } from "@/lib/neis";

/**
 * 학교를 고르면 학부모가 궁금해할 것을 덧붙인다.
 *
 * 카카오는 이름·주소·전화까지만 준다. 공립인지 사립인지, 남녀공학인지,
 * 오늘 급식이 무엇인지는 나이스 교육정보 개방 포털에서 가져온다.
 *
 * 학생수·진학률은 여기 없다. 학교알리미 소관이고 별도 키가 필요하다.
 * 없는 것을 있는 척하지 않고, 무엇이 빠졌는지 적어 둔다.
 */
export default function SchoolFacts({ name }: { name: string }) {
  const { data, isLoading } = useSWR<ApiEnvelope<{ school: Facts | null }>>(
    `/api/school?name=${encodeURIComponent(name)}`,
    swrFetcher,
    { revalidateOnFocus: false, dedupingInterval: 60 * 60_000 },
  );

  if (isLoading && !data) {
    return (
      <p className="mt-3 border-t border-[var(--border)] pt-3 text-[var(--text-xs)] text-[var(--text-muted)]">
        학교 정보를 불러오는 중…
      </p>
    );
  }

  const s = data?.data.school;
  // 개교 예정 학교나 대학은 나이스에 없다. 조용히 넘어간다.
  if (!s) return null;

  const tags = [s.kind, s.founder, s.coed, s.highKind].filter(Boolean) as string[];

  return (
    <div className="mt-3 border-t border-[var(--border)] pt-3">
      <div className="flex flex-wrap gap-1">
        {tags.map((t) => (
          <span
            key={t}
            className="rounded-full bg-[var(--surface-2)] px-2 py-0.5 text-[var(--text-2xs)] font-bold text-[var(--text-muted)]"
          >
            {t}
          </span>
        ))}
      </div>

      {s.classes && s.classes.length > 0 && (
        <div className="mt-2">
          <p className="text-[var(--text-2xs)] font-bold text-[var(--text-muted)]">
            학급 {s.classTotal}개
          </p>
          <div className="mt-1 flex flex-wrap gap-1">
            {s.classes.map((c) => (
              <span
                key={c.grade}
                className="rounded-[var(--radius)] bg-[var(--surface-2)] px-2 py-1 text-[var(--text-2xs)] font-semibold tabular-nums"
              >
                {c.grade}학년 <b>{c.count}</b>반
              </span>
            ))}
          </div>
        </div>
      )}

      {s.foundedAt && (
        <p className="mt-2 text-[var(--text-2xs)] text-[var(--text-faint)]">
          {s.foundedAt} 개교
          {s.officialName !== name && ` · 정식 명칭 ${s.officialName}`}
        </p>
      )}

      {s.meal && (
        <div className="mt-2 rounded-[var(--radius)] bg-[var(--surface-2)] p-2.5">
          <p className="text-[var(--text-2xs)] font-bold text-[var(--text-muted)]">
            {s.meal.when === "today" ? "오늘 급식" : `다음 급식 ${s.meal.date}`}
            {s.meal.kcal && ` · ${s.meal.kcal}`}
          </p>
          <p className="mt-1 text-[var(--text-xs)] leading-relaxed">
            {s.meal.dishes.join(" · ")}
          </p>
        </div>
      )}

      <div className="mt-2 flex flex-wrap gap-1.5">
        {s.homepage && (
          <a
            href={s.homepage}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex min-h-[36px] items-center rounded-[var(--radius)] border border-[var(--border)] px-2.5 text-[var(--text-2xs)] font-semibold"
          >
            학교 홈페이지 ↗
          </a>
        )}
        {/*
          학생수·학급수·진학률은 학교알리미에만 있다. 우리가 못 가져오는
          것을 숨기는 대신 어디에 있는지 알려준다. 학교별 주소로 바로
          들어가는 길은 없어 검색 화면으로 보낸다.
        */}
        <a
          href="https://www.schoolinfo.go.kr/ei/ss/pneiss_a03_s0.do"
          target="_blank"
          rel="noreferrer noopener"
          className="inline-flex min-h-[36px] items-center rounded-[var(--radius)] border border-[var(--border)] px-2.5 text-[var(--text-2xs)] font-semibold"
        >
          학생수·진학률 ↗
        </a>
      </div>
    </div>
  );
}
