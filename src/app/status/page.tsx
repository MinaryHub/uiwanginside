import Link from "next/link";
import type { HealthCheck } from "@/app/api/health/route";
import { headers } from "next/headers";

export const dynamic = "force-dynamic";

const STATUS_META = {
  live: { label: "정상", color: "#10b981", emoji: "✅" },
  fallback: { label: "대체 동작", color: "#3b82f6", emoji: "🔵" },
  error: { label: "오류", color: "#dc2626", emoji: "❌" },
  missing: { label: "키 없음", color: "#9ca3af", emoji: "⚪" },
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
    <main className="mx-auto max-w-3xl px-5 py-8">
      <div className="mb-6 flex items-baseline gap-3">
        <h1 className="text-xl font-extrabold tracking-tight">API 연동 상태</h1>
        <Link href="/" className="text-[12px] font-semibold text-[var(--brand)]">
          ← 포털로
        </Link>
      </div>

      {error && (
        <p className="rounded-lg bg-red-500/10 p-3 text-[13px] text-red-600">{error}</p>
      )}

      {data && (
        <>
          <p className="mb-5 text-[13px] text-[var(--muted)]">
            <strong className="text-[var(--foreground)]">
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
                  className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3.5"
                  style={{ borderLeft: `3px solid ${m.color}` }}
                >
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <span className="text-[13.5px] font-bold">{c.label}</span>
                    <span
                      className="rounded px-1.5 py-0.5 text-[10.5px] font-bold text-white"
                      style={{ background: m.color }}
                    >
                      {m.emoji} {m.label}
                    </span>
                    {c.latencyMs != null && (
                      <span className="text-[10.5px] text-[var(--muted)]">
                        {c.latencyMs}ms
                      </span>
                    )}
                    <code className="ml-auto text-[10.5px] text-[var(--muted)]">
                      {c.envVars.join(", ")}
                    </code>
                  </div>

                  <p className="text-[12.5px] leading-snug">{c.detail}</p>

                  {c.fallback && (
                    <p className="mt-1 text-[11.5px] font-semibold text-blue-500">
                      대체 소스: {c.fallback}
                    </p>
                  )}

                  {c.status !== "live" && (
                    <p className="mt-1.5 rounded-md bg-[var(--surface-2)] px-2 py-1 text-[11px] text-[var(--muted)]">
                      발급: {c.howTo}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>

          <p className="mt-5 text-[11px] text-[var(--muted)]">
            진단 시각 {new Date(data.checkedAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}{" "}
            · 키 변경 후에는 개발 서버를 재시작해야 반영됩니다.
          </p>
        </>
      )}
    </main>
  );
}
