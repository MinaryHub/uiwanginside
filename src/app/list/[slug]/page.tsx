import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import Logo from "@/components/Logo";
import { getSharedList } from "@/lib/listDb";
import { CATEGORY_MAP } from "@/lib/uiwang";
import { hasDb } from "@/lib/db";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  if (!hasDb()) return { title: "장소 리스트" };
  const list = await getSharedList((await params).slug).catch(() => null);
  if (!list) return { title: "장소 리스트" };
  return {
    title: `${list.title} — 의왕 인사이드`,
    description: list.description ?? `의왕 장소 ${list.itemCount}곳`,
    openGraph: {
      title: list.title,
      description: list.description ?? `의왕 장소 ${list.itemCount}곳`,
      type: "article",
    },
  };
}

export default async function SharedListPage({ params }: Props) {
  if (!hasDb()) notFound();
  const list = await getSharedList((await params).slug).catch(() => null);
  if (!list) notFound();

  return (
    <main className="mx-auto max-w-[640px] px-4 py-6">
      <header className="mb-6">
        <Link href="/" className="mb-4 inline-flex items-center gap-2">
          <Logo size={24} />
          <span className="text-[var(--text-xs)] font-bold text-[var(--text-muted)]">
            의왕 인사이드
          </span>
        </Link>
        <h1 className="text-[var(--text-lg)] font-extrabold">{list.title}</h1>
        {list.description && (
          <p className="mt-1.5 text-[var(--text-sm)] leading-relaxed text-[var(--text-muted)]">
            {list.description}
          </p>
        )}
        <p className="mt-2 text-[var(--text-xs)] text-[var(--text-faint)]">
          {list.ownerName ? `${list.ownerName} 님이 고른 ` : ""}
          {list.itemCount}곳
        </p>
      </header>

      {list.items.length === 0 ? (
        <p className="py-10 text-center text-[var(--text-sm)] text-[var(--text-muted)]">
          아직 담긴 장소가 없습니다.
        </p>
      ) : (
        <ol className="divide-y divide-[var(--border)]">
          {list.items.map((it, i) => {
            const def = CATEGORY_MAP[it.category];
            return (
              <li key={it.id} className="py-3.5">
                <div className="flex items-baseline gap-2">
                  <span className="tnum w-5 shrink-0 text-[var(--text-xs)] font-bold text-[var(--text-faint)]">
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <h2 className="text-[var(--text-base)] font-bold">{it.name}</h2>
                    <p className="mt-0.5 text-[var(--text-xs)] text-[var(--text-muted)]">
                      <span style={{ color: def?.color }} className="font-bold">
                        {def?.label ?? it.category}
                      </span>
                      {it.address ? ` · ${it.address}` : ""}
                    </p>
                    {it.note && (
                      <p className="mt-1.5 rounded-[var(--radius)] bg-[var(--surface-2)] px-2.5 py-1.5 text-[var(--text-xs)] leading-relaxed">
                        {it.note}
                      </p>
                    )}
                    <div className="mt-2 flex gap-1.5">
                      <a
                        href={`https://map.kakao.com/link/to/${encodeURIComponent(it.name)},${it.lat},${it.lng}`}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="inline-flex min-h-[36px] items-center rounded-[var(--radius)] border border-[var(--border-strong)] px-2.5 text-[var(--text-2xs)] font-bold"
                      >
                        길찾기
                      </a>
                      {it.phone && (
                        <a
                          href={`tel:${it.phone}`}
                          className="inline-flex min-h-[36px] items-center rounded-[var(--radius)] border border-[var(--border-strong)] px-2.5 text-[var(--text-2xs)] font-bold"
                        >
                          {it.phone}
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      )}

      <div className="mt-8 rounded-[var(--radius)] bg-[var(--surface-2)] p-4 text-center">
        <p className="text-[var(--text-xs)] leading-relaxed text-[var(--text-muted)]">
          의왕 인사이드에서 나만의 장소 리스트를 만들고 공유해 보세요.
        </p>
        <Link
          href="/lists"
          className="mt-3 inline-flex min-h-[44px] items-center rounded-[var(--radius)] px-4 text-[var(--text-sm)] font-bold"
          style={{ background: "var(--brand)", color: "var(--on-brand)" }}
        >
          내 리스트 만들기
        </Link>
      </div>
    </main>
  );
}
