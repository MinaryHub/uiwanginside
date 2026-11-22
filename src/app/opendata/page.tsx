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
const providers = new Set(all.map((d) => d.provider)).size;

/**
 * 장식 없이 글자와 선만으로 짠다. 자료 목록은 표에 가깝게 — 한 줄에
 * 이름·기관·주기가 나란히 있어야 훑어 내려가며 비교할 수 있다.
 */
export default function DataPage() {
  return (
    <main className="mx-auto min-h-dvh max-w-3xl px-5 pb-20 pt-6 sm:px-8">
      <nav className="flex items-center gap-2">
        <Link href="/" className="flex items-center gap-2">
          <Logo size={24} />
          <span className="text-[length:var(--text-sm)] font-bold tracking-tight">의왕 인사이드</span>
        </Link>
        <Link
          href="/"
          className="ml-auto text-[length:var(--text-xs)] font-medium text-[var(--text-muted)] hover:text-[var(--text)]"
        >
          지도로 →
        </Link>
      </nav>

      <header className="mt-16 sm:mt-24">
        <h1 className="text-[2rem] font-bold leading-[1.2] tracking-[-0.03em] sm:text-[2.5rem]">
          공공데이터 안내
        </h1>
        <p className="mt-4 max-w-lg text-[length:var(--text-base)] leading-relaxed text-[var(--text-muted)]">
          흩어져 있는 의왕시 공공데이터를 지도 한 장에 모았습니다. 로그인 없이 누구나 볼 수
          있고, 화면의 모든 숫자는 아래 기관이 공개한 자료에서 옵니다.
        </p>

        <dl className="mt-8 grid grid-cols-3 gap-2.5 sm:max-w-md">
          {[
            { k: "자료", v: total },
            { k: "실시간", v: live },
            { k: "제공 기관", v: providers },
          ].map((x) => (
            <div
              key={x.k}
              className="rounded-[var(--radius)] border-2 border-[var(--frame)] bg-[var(--surface)] px-3.5 py-3 shadow-[var(--shadow-sm)]"
            >
              <dt className="text-[length:var(--text-xs)] font-semibold text-[var(--text-muted)]">
                {x.k}
              </dt>
              <dd className="tnum mt-1 text-[1.75rem] font-extrabold leading-none tracking-tight">
                {x.v}
              </dd>
            </div>
          ))}
        </dl>
      </header>

      <div className="mt-16 space-y-14">
        {DATASET_GROUPS.map((g) => (
          <section key={g.title}>
            <h2 className="flex items-baseline gap-2 border-b border-[var(--text)] pb-2 text-[length:var(--text-base)] font-bold">
              {g.title}
              <span className="tnum text-[length:var(--text-xs)] font-medium text-[var(--text-faint)]">
                {g.items.length}
              </span>
            </h2>
            <ul>
              {g.items.map((d) => (
                <li
                  key={d.id}
                  className="grid gap-x-6 gap-y-1 border-b border-[var(--border)] py-4 sm:grid-cols-[1fr_auto]"
                >
                  <div className="min-w-0">
                    <a
                      href={d.link}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="text-[length:var(--text-sm)] font-semibold underline-offset-4 hover:underline"
                    >
                      {d.name}
                    </a>
                    <p className="mt-0.5 text-[length:var(--text-sm)] text-[var(--text-muted)]">{d.shows}</p>
                    <p className="mt-1 text-[length:var(--text-xs)] text-[var(--text-faint)]">
                      {d.provider}
                    </p>
                  </div>
                  <div className="flex items-center gap-4 sm:flex-col sm:items-end sm:gap-1">
                    <span className="tnum text-[length:var(--text-xs)] text-[var(--text-muted)]">
                      {d.kind === "live" && (
                        <span
                          aria-hidden
                          className="mr-1.5 inline-block h-1.5 w-1.5 -translate-y-px rounded-full bg-[var(--brand)] align-middle"
                        />
                      )}
                      {d.kind === "live" ? `실시간 · ${d.refresh}` : d.refresh}
                    </span>
                    <Link
                      href={d.mode ? `/?m=${d.mode}` : "/"}
                      className="text-[length:var(--text-xs)] font-medium text-[var(--brand)] hover:underline underline-offset-4"
                    >
                      {d.mode ? `${MODE_MAP[d.mode].label}에서 보기` : "요약줄에서 보기"}
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))}

        <section>
          <h2 className="border-b border-[var(--text)] pb-2 text-[length:var(--text-base)] font-bold">
            함께 쓰는 자료
          </h2>
          <ul>
            {OTHER_SOURCES.map((o) => (
              <li
                key={o.name}
                className="flex flex-col gap-0.5 border-b border-[var(--border)] py-4 sm:flex-row sm:gap-6"
              >
                <span className="shrink-0 text-[length:var(--text-sm)] font-semibold sm:w-52">{o.name}</span>
                <span className="text-[length:var(--text-sm)] text-[var(--text-muted)]">{o.use}</span>
              </li>
            ))}
          </ul>
        </section>

        <p className="text-[length:var(--text-xs)] leading-relaxed text-[var(--text-faint)]">
          각 자료의 저작권은 제공 기관에 있으며, 공공누리 및 각 서비스의 이용 조건에 따라
          사용합니다. 연동이 정상인지는{" "}
          <Link href="/status" className="text-[var(--text-muted)] underline underline-offset-4">
            연동 상태
          </Link>
          에서 확인할 수 있습니다.
        </p>
      </div>
    </main>
  );
}
