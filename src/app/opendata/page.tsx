import type { Metadata } from "next";
import Link from "next/link";
import Logo from "@/components/Logo";
import { DATASET_GROUPS, OTHER_SOURCES } from "@/lib/datasets";
import { MODE_MAP } from "@/lib/modes";

export const metadata: Metadata = {
  title: "공공데이터 안내 — 의왕 인사이드",
  description: "의왕 인사이드가 보여주는 공공데이터의 출처·갱신 주기·화면 위치를 한눈에 확인하세요.",
};

const all = DATASET_GROUPS.flatMap((g) => g.items);
const total = all.length;
const live = all.filter((d) => d.kind === "live").length;
const providers = new Set(all.map((d) => d.provider.split(" ")[0])).size;

export default function DataPage() {
  return (
    <main className="min-h-dvh pb-16">
      {/* 머리 — 브랜드 그라데이션 위에 큰 제목 */}
      <section className="relative overflow-hidden">
        <div
          aria-hidden
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(120% 90% at 0% 0%, color-mix(in srgb, var(--brand-2) 30%, transparent), transparent 60%)," +
              "radial-gradient(90% 80% at 100% 0%, color-mix(in srgb, var(--info) 18%, transparent), transparent 55%)",
          }}
        />
        <div className="relative mx-auto max-w-4xl px-4 pb-8 pt-5 sm:px-6 sm:pb-12">
          <nav className="flex items-center gap-2">
            <Link href="/" className="press flex items-center gap-2 rounded-full py-1 pr-2">
              <Logo size={30} />
              <span className="text-[var(--text-base)] font-extrabold tracking-tight">
                의왕 인사이드
              </span>
            </Link>
            <Link
              href="/"
              className="glass press ml-auto inline-flex min-h-[40px] items-center rounded-full px-4 text-[var(--text-xs)] font-bold"
            >
              지도로 돌아가기
            </Link>
          </nav>

          <p className="mt-10 text-[var(--text-xs)] font-bold tracking-wide text-[var(--brand)]">
            OPEN DATA
          </p>
          <h1 className="mt-1.5 text-[2rem] font-extrabold leading-[1.15] tracking-[-0.04em] sm:text-[2.75rem]">
            의왕의 공공데이터,
            <br />
            <span
              className="bg-clip-text text-transparent"
              style={{ backgroundImage: "var(--brand-grad)" }}
            >
              지도 한 장에.
            </span>
          </h1>
          <p className="mt-4 max-w-xl text-[var(--text-base)] leading-relaxed text-[var(--text-muted)]">
            흩어져 있는 기관별 자료를 모아 보기 쉽게 보여줍니다. 회원가입이나 로그인 없이 누구나
            볼 수 있고, 화면의 모든 숫자는 아래 기관이 공개한 자료에서 옵니다.
          </p>

          {/* 숫자 세 개 — 벤토 */}
          <dl className="mt-8 grid grid-cols-3 gap-2 sm:gap-3">
            {[
              { k: "자료", v: total, u: "종" },
              { k: "실시간", v: live, u: "종" },
              { k: "제공 기관", v: providers, u: "곳" },
            ].map((x) => (
              <div key={x.k} className="glass rounded-[var(--radius-lg)] px-3.5 py-3 sm:px-5 sm:py-4">
                <dt className="text-[var(--text-2xs)] font-bold text-[var(--text-muted)]">{x.k}</dt>
                <dd className="tnum mt-1.5 text-[1.75rem] font-extrabold leading-none tracking-tight sm:text-[2.25rem]">
                  {x.v}
                  <span className="ml-0.5 text-[var(--text-sm)] font-bold text-[var(--text-faint)]">
                    {x.u}
                  </span>
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <div className="mx-auto max-w-4xl space-y-10 px-4 sm:px-6">
        {DATASET_GROUPS.map((g) => (
          <section key={g.title}>
            <h2 className="mb-3 flex items-center gap-2.5 text-[var(--text-lg)] font-extrabold">
              <span
                aria-hidden
                className="grid h-9 w-9 place-items-center rounded-[var(--radius)] bg-[var(--surface)] text-[1.1rem] shadow-[var(--shadow-sm)] ring-1 ring-[var(--border)]"
              >
                {g.emoji}
              </span>
              {g.title}
              <span className="text-[var(--text-sm)] font-bold text-[var(--text-faint)]">
                {g.items.length}
              </span>
            </h2>
            <ul className="stagger grid gap-3 sm:grid-cols-2">
              {g.items.map((d) => (
                <li
                  key={d.id}
                  className="group flex flex-col rounded-[var(--radius-lg)] bg-[var(--surface)] p-4 shadow-[var(--shadow-sm)] ring-1 ring-[var(--border)] transition duration-200 hover:-translate-y-0.5 hover:shadow-[var(--shadow-md)]"
                >
                  <div className="flex items-start gap-2">
                    <a
                      href={d.link}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="min-w-0 flex-1 text-[var(--text-base)] font-bold leading-snug underline-offset-4 hover:underline"
                    >
                      {d.name}
                    </a>
                    <span
                      className={`shrink-0 rounded-full px-2.5 py-0.5 text-[var(--text-2xs)] font-bold ${
                        d.kind === "live" ? "brand-fill" : ""
                      }`}
                      style={
                        d.kind === "live"
                          ? undefined
                          : { background: "var(--surface-2)", color: "var(--text-muted)" }
                      }
                    >
                      {d.kind === "live" ? `실시간 · ${d.refresh}` : d.refresh}
                    </span>
                  </div>
                  <p className="mt-1 text-[var(--text-xs)] font-semibold text-[var(--text-faint)]">
                    {d.provider}
                  </p>
                  <p className="mt-2 flex-1 text-[var(--text-sm)] leading-snug text-[var(--text-muted)]">
                    {d.shows}
                  </p>
                  <Link
                    href={d.mode ? `/?m=${d.mode}` : "/"}
                    className="mt-3 inline-flex min-h-[36px] items-center gap-1 self-start rounded-full bg-[var(--brand-soft)] px-3 text-[var(--text-xs)] font-bold text-[var(--brand)] transition group-hover:gap-1.5"
                  >
                    {d.mode ? `지도에서 보기 · ${MODE_MAP[d.mode].label}` : "상단 요약줄에서 보기"}
                    <span aria-hidden>→</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}

        <section>
          <h2 className="mb-3 text-[var(--text-lg)] font-extrabold">함께 쓰는 자료</h2>
          <ul className="divide-y divide-[var(--border)] rounded-[var(--radius-lg)] bg-[var(--surface)] px-4 shadow-[var(--shadow-sm)] ring-1 ring-[var(--border)]">
            {OTHER_SOURCES.map((o) => (
              <li key={o.name} className="flex flex-col gap-0.5 py-3 sm:flex-row sm:gap-3">
                <strong className="shrink-0 text-[var(--text-sm)] sm:w-48">{o.name}</strong>
                <span className="text-[var(--text-sm)] text-[var(--text-muted)]">{o.use}</span>
              </li>
            ))}
          </ul>
        </section>

        <p className="text-[var(--text-xs)] leading-relaxed text-[var(--text-faint)]">
          각 자료의 저작권은 제공 기관에 있으며, 공공누리 및 각 서비스의 이용 조건에 따라
          사용합니다. 연동이 정상인지는{" "}
          <Link href="/status" className="font-semibold text-[var(--brand)] underline underline-offset-4">
            연동 상태
          </Link>
          에서 확인할 수 있습니다.
        </p>
      </div>
    </main>
  );
}
