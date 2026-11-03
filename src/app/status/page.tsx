import Link from "next/link";
import Logo from "@/components/Logo";
import type { HealthCheck } from "@/app/api/health/route";
import { headers } from "next/headers";

export const dynamic = "force-dynamic";

const STATUS_META = {
  live: { label: "정상", color: "var(--ok)", emoji: "✅" },
  fallback: { label: "대체 동작", color: "var(--info)", emoji: "🔵" },
  error: { label: "오류", color: "var(--danger)", emoji: "❌" },
  missing: { label: "키 없음", color: "var(--text-faint)", emoji: "⚪" },
} as const;

export default async function StatusPage() {
  const h = await headers();
  const host = h.get("host") ?? "localhost:3000";
  const proto = host.startsWith("localhost") ? "http" : "https";

  let data: { checks: HealthCheck[]; summary: { live: number; total: number }; checkedAt: string } | null =
    null;
  let error: string | null = null;

  try {
    const res = await fetch(`${proto}://${host}/api/health`, { cache: "no-store" });
    data = await res.json();
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  return (
    <main className="mx-auto max-w-3xl px-5 py-10">
      <div className="mb-6 flex items-center gap-3">
        <Logo size={26} />
        <h1 className="text-[var(--text-lg)] font-extrabold tracking-tight">연동 상태</h1>
        <Link href="/" className="text-[var(--text-xs)] font-semibold text-[var(--brand)]">
          ← 포털로
        </Link>
        <Link
          href="/opendata"
          className="ml-auto text-[var(--text-xs)] font-semibold text-[var(--brand)]"
        >
          공공데이터 안내 →
        </Link>
      </div>

      {error && (
        <p className="rounded-[var(--radius)] bg-[var(--danger-soft)] p-3 text-[var(--text-sm)] text-[var(--danger)]">{error}</p>
      )}

      {data && (
        <>
          <p className="mb-5 text-[var(--text-sm)] text-[var(--text-muted)]">
            <strong className="text-[var(--text)]">
              {data.summary.live} / {data.summary.total}
            </strong>{" "}
            연동 정상 · 이 페이지를 새로고침하면 각 API 를 실제로 1회 호출해 다시 진단합니다.
          </p>

          <ul className="space-y-2.5">
            {data.checks.map((c) => {
              const m = STATUS_META[c.status];
              return (
                <li
                  key={c.id}
                  className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-3.5"
                  style={{ borderLeft: `3px solid ${m.color}` }}
                >
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <span className="text-[var(--text-base)] font-bold">{c.label}</span>
                    <span
                      className="rounded px-1.5 py-0.5 text-[var(--text-2xs)] font-bold text-[var(--surface)]"
                      style={{ background: m.color }}
                    >
                      {m.emoji} {m.label}
                    </span>
                    {c.latencyMs != null && (
                      <span className="text-[var(--text-2xs)] text-[var(--text-muted)]">
                        {c.latencyMs}ms
                      </span>
                    )}
                    <code className="ml-auto text-[var(--text-2xs)] text-[var(--text-muted)]">
                      {c.envVars.join(", ")}
                    </code>
                  </div>

                  <p className="text-[var(--text-sm)] leading-snug">{c.detail}</p>

                  {c.fallback && (
                    <p className="mt-1 text-[var(--text-xs)] font-semibold text-[var(--info)]">
                      대체 소스: {c.fallback}
                    </p>
                  )}

                  {c.status !== "live" && (
                    <p className="mt-1.5 rounded-md bg-[var(--surface-2)] px-2 py-1 text-[var(--text-xs)] text-[var(--text-muted)]">
                      발급: {c.howTo}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>

          <p className="mt-5 text-[var(--text-xs)] text-[var(--text-muted)]">
            진단 시각 {new Date(data.checkedAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}{" "}
            · 키 변경 후에는 개발 서버를 재시작해야 반영됩니다.
          </p>
        </>
      )}
    </main>
  );
}
