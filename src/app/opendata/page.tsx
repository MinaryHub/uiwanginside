import type { Metadata } from "next";
import Link from "next/link";
import Logo from "@/components/Logo";
import { DATASET_GROUPS, OTHER_SOURCES } from "@/lib/datasets";
import { MODE_MAP } from "@/lib/modes";

export const metadata: Metadata = {
  title: "공공데이터 안내 — 의왕 인사이드",
  description: "의왕 인사이드가 보여주는 공공데이터의 출처·갱신 주기·화면 위치를 한눈에 확인하세요.",
};

const total = DATASET_GROUPS.reduce((n, g) => n + g.items.length, 0);
const live = DATASET_GROUPS.reduce(
  (n, g) => n + g.items.filter((d) => d.kind === "live").length,
  0,
);

export default function DataPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-6 sm:px-5 sm:py-10">
      <div className="mb-5 flex items-center gap-2.5">
        <Link href="/" className="flex items-center gap-2">
          <Logo size={26} />
          <h1 className="text-[var(--text-lg)] font-extrabold tracking-tight">공공데이터 안내</h1>
        </Link>
        <Link
          href="/"
          className="ml-auto text-[var(--text-xs)] font-semibold text-[var(--brand)]"
        >
          ← 지도로
        </Link>
      </div>

      <p className="mb-6 text-[var(--text-sm)] leading-relaxed text-[var(--text-muted)]">
        의왕 인사이드는 흩어져 있는 의왕시 공공데이터를 지도 한 장에 모아 보여줍니다.{" "}
        <strong className="text-[var(--text)]">
          {total}종 가운데 {live}종
        </strong>
        은 주기적으로 새로 받아오는 실시간 자료이고, 나머지는 자주 바뀌지 않아 저장소에
        굳혀 둔 스냅샷입니다. 회원가입이나 로그인 없이 누구나 볼 수 있습니다.
      </p>

      <div className="space-y-6">
        {DATASET_GROUPS.map((g) => (
          <section key={g.title}>
            <h2 className="mb-2 flex items-center gap-1.5 text-[var(--text-base)] font-extrabold">
              <span aria-hidden>{g.emoji}</span>
              {g.title}
            </h2>
            <ul className="space-y-2">
              {g.items.map((d) => (
                <li
                  key={d.id}
                  className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-3.5"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <a
                      href={d.link}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="text-[var(--text-sm)] font-bold underline-offset-4 hover:underline"
                    >
                      {d.name}
                    </a>
                    <span
                      className="rounded px-1.5 py-0.5 text-[var(--text-2xs)] font-bold"
                      style={
                        d.kind === "live"
                          ? { background: "var(--brand)", color: "var(--on-brand)" }
                          : { background: "var(--surface-2)", color: "var(--text-muted)" }
                      }
                    >
                      {d.kind === "live" ? `실시간 · ${d.refresh}` : d.refresh}
                    </span>
                  </div>
                  <p className="mt-1 text-[var(--text-xs)] text-[var(--text-muted)]">
                    {d.provider}
                  </p>
                  <p className="mt-1.5 text-[var(--text-sm)] leading-snug">{d.shows}</p>
                  <Link
                    href={d.mode ? `/?mode=${d.mode}` : "/"}
                    className="mt-2 inline-flex min-h-[36px] items-center text-[var(--text-xs)] font-bold text-[var(--brand)]"
                  >
                    {d.mode
                      ? `지도에서 보기 — ${MODE_MAP[d.mode].label} →`
                      : "지도 상단 요약줄에서 보기 →"}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}

        <section>
          <h2 className="mb-2 text-[var(--text-base)] font-extrabold">함께 쓰는 자료</h2>
          <ul className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-3.5 text-[var(--text-sm)]">
            {OTHER_SOURCES.map((o) => (
              <li key={o.name} className="py-1">
                <strong>{o.name}</strong>{" "}
                <span className="text-[var(--text-muted)]">— {o.use}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <p className="mt-6 text-[var(--text-xs)] leading-relaxed text-[var(--text-faint)]">
        각 자료의 저작권은 제공 기관에 있으며, 공공누리 및 각 서비스의 이용 조건에 따라
        사용합니다. 연동이 정상인지는{" "}
        <Link href="/status" className="font-semibold text-[var(--brand)] underline underline-offset-4">
          연동 상태
        </Link>
        에서 확인할 수 있습니다.
      </p>
    </main>
  );
}
