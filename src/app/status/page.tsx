import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import Logo from "@/components/Logo";
import { runHealthChecks, resolvePublicOrigin, type HealthReport } from "@/lib/health";

export const dynamic = "force-dynamic";
export const maxDuration = 25;

export const metadata: Metadata = {
  title: "연동 상태 — 의왕 인사이드",
  description: "의왕 인사이드 외부 공공 API 및 지도 연동 실시간 진단",
};

const STATUS_META = {
  live: { label: "정상", bg: "var(--ok-soft)", fg: "var(--ok)", border: "var(--ok)", emoji: "✅" },
  fallback: { label: "대체 동작", bg: "var(--info-soft)", fg: "var(--info)", border: "var(--info)", emoji: "🔵" },
  error: { label: "오류", bg: "var(--danger-soft)", fg: "var(--danger)", border: "var(--danger)", emoji: "❌" },
  missing: { label: "키 없음", bg: "var(--surface-2)", fg: "var(--text-muted)", border: "var(--border)", emoji: "⚪" },
} as const;

export default async function StatusPage() {
  const h = await headers();
  const origin = resolvePublicOrigin(h);

  let data: HealthReport | null = null;
  let error: string | null = null;

  try {
    data = await runHealthChecks(origin);
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  return (
    <main className="mx-auto max-w-3xl px-5 py-10">
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <Logo size={28} />
        <h1 className="text-[length:var(--text-lg)] font-extrabold tracking-tight">연동 상태</h1>
        <Link href="/" className="text-[length:var(--text-xs)] font-bold text-[var(--brand)] underline-offset-4 hover:underline">
          ← 포털로
        </Link>
        <Link
          href="/opendata"
          className="ml-auto text-[length:var(--text-xs)] font-bold text-[var(--brand)] underline-offset-4 hover:underline"
        >
          공공데이터 안내 →
        </Link>
      </div>

      {error && (
        <p className="rounded-[var(--radius)] border-2 border-[var(--danger)] bg-[var(--danger-soft)] p-3 text-[length:var(--text-sm)] font-semibold text-[var(--danger)]">
          {error}
        </p>
      )}

      {data && (
        <>
          <div className="mb-5 flex flex-wrap items-center justify-between gap-2 text-[length:var(--text-sm)] text-[var(--text-muted)]">
            <p>
              <strong className="text-[var(--text)]">
                {data.summary.live} / {data.summary.total}
              </strong>{" "}
              연동 정상 · 45초 단위로 실제 API 응답을 진단합니다.
            </p>
            <a
              href="/status"
              className="inline-flex min-h-[40px] items-center rounded-[var(--radius-full)] border-2 border-[var(--ink)] bg-[var(--surface)] px-3.5 text-[length:var(--text-xs)] font-extrabold text-[var(--text)] shadow-[var(--shadow-sm)]"
            >
              다시 진단
            </a>
          </div>

          <ul className="space-y-2.5">
            {data.checks.map((c) => {
              const m = STATUS_META[c.status];
              return (
                <li
                  key={c.id}
                  className="rounded-[var(--radius-lg)] border-2 border-[var(--ink)] bg-[var(--surface)] p-3.5 shadow-[var(--shadow-sm)]"
                  style={{ borderLeft: `5px solid ${m.border}` }}
                >
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <span className="text-[length:var(--text-base)] font-extrabold">{c.label}</span>
                    <span
                      className="rounded-full px-2 py-0.5 text-[length:var(--text-2xs)] font-extrabold"
                      style={{ background: m.bg, color: m.fg }}
                    >
                      <span aria-hidden>{m.emoji}</span> {m.label}
                    </span>
                    {c.latencyMs != null && (
                      <span className="tnum text-[length:var(--text-2xs)] text-[var(--text-muted)]">
                        {c.latencyMs}ms
                      </span>
                    )}
                    <code className="ml-auto text-[length:var(--text-2xs)] text-[var(--text-muted)]">
                      {c.envVars.join(", ")}
                    </code>
                  </div>

                  <p className="text-[length:var(--text-sm)] leading-snug">{c.detail}</p>

                  {c.fallback && (
                    <p className="mt-1 text-[length:var(--text-xs)] font-semibold text-[var(--info)]">
                      대체 소스: {c.fallback}
                    </p>
                  )}

                  {c.status !== "live" && (
                    <p className="mt-1.5 rounded-md bg-[var(--surface-2)] px-2.5 py-1.5 text-[length:var(--text-xs)] text-[var(--text-muted)]">
                      발급: {c.howTo}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>

          <p className="mt-5 text-[length:var(--text-xs)] text-[var(--text-muted)]">
            진단 시각 {new Date(data.checkedAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}{" "}
            · 키 변경 후에는 서버 재시작 또는 재배포가 필요합니다.
          </p>
        </>
      )}
    </main>
  );
}
