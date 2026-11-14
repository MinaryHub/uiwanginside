"use client";

import { Section, Skeleton, Empty, LiveDot, Unavailable, Notice, timeAgo } from "@/components/ui";
import type { ApiEnvelope, EmergencyPayload, EmergencyRoom } from "@/lib/types";

/** 갱신한 지 이만큼 지나면 숫자를 믿기 어렵다고 알린다 */
const STALE_MS = 60 * 60_000;

function km(m: number) {
  return m >= 1000 ? `${(m / 1000).toFixed(1)}km` : `${m}m`;
}

/**
 * 남은 병상.
 * 색 하나로만 말하지 않는다 — 숫자와 낱말을 함께 쓴다.
 */
function Beds({ r }: { r: EmergencyRoom }) {
  if (r.beds == null) {
    return <span className="text-[length:var(--text-xs)] text-[var(--text-faint)]">정보 없음</span>;
  }
  const full = r.beds <= 0;
  return (
    <span
      className="tnum text-right leading-none"
      style={{ color: full ? "var(--danger)" : r.beds <= 2 ? "var(--warn)" : "var(--text)" }}
    >
      <span className="text-[length:var(--text-lg)] font-bold">{full ? "포화" : r.beds}</span>
      {!full && (
        <span className="ml-0.5 text-[length:var(--text-2xs)] text-[var(--text-muted)]">
          {r.totalBeds ? `/${r.totalBeds}` : "병상"}
        </span>
      )}
    </span>
  );
}

/** at = 서버가 응답을 만든 시각. 렌더 중에 현재 시각을 읽지 않는다 */
function Row({ r, at }: { r: EmergencyRoom; at: string }) {
  const stale = !!r.reportedAt && Date.parse(at) - Date.parse(r.reportedAt) > STALE_MS;
  const gear = [
    r.ct && "CT",
    r.mri && "MRI",
    r.ventilator && "인공호흡기",
  ].filter(Boolean) as string[];
  const directions = `https://map.kakao.com/link/to/${encodeURIComponent(r.name)},${r.lat},${r.lng}`;

  return (
    <li className="border-b border-[var(--border)] py-3 last:border-b-0">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[length:var(--text-sm)] font-semibold">{r.name}</p>
          <p className="mt-0.5 truncate text-[length:var(--text-xs)] text-[var(--text-muted)]">
            {km(r.distance)}
            {r.level && ` · ${r.level}`}
          </p>
        </div>
        <Beds r={r} />
      </div>

      {(gear.length > 0 || r.reportedAt) && (
        <p className="mt-1 text-[length:var(--text-2xs)] text-[var(--text-faint)]">
          {gear.length > 0 && gear.join(" · ")}
          {r.reportedAt && (
            <span style={stale ? { color: "var(--warn)", fontWeight: 700 } : undefined}>
              {gear.length > 0 && " · "}
              {timeAgo(r.reportedAt)} 갱신
            </span>
          )}
        </p>
      )}

      {/* 급할 때 누를 것 둘. 큼직하게 */}
      <div className="mt-2.5 flex gap-2">
        {r.phone && (
          <a
            href={`tel:${r.phone}`}
            className="brand-fill press flex min-h-[44px] flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-[var(--radius-full)] border-2 text-[length:var(--text-sm)] font-extrabold shadow-[var(--shadow-sm)]"
          >
            <span aria-hidden>📞</span> 전화
          </a>
        )}
        <a
          href={directions}
          target="_blank"
          rel="noreferrer noopener"
          className="press flex min-h-[44px] flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-[var(--radius-full)] border-2 border-[var(--ink)] bg-[var(--surface)] text-[length:var(--text-sm)] font-extrabold shadow-[var(--shadow-sm)]"
        >
          <span aria-hidden>🧭</span> 길찾기
        </a>
      </div>
    </li>
  );
}

export default function EmergencyPanel({
  res,
  isLoading,
}: {
  res?: ApiEnvelope<EmergencyPayload>;
  isLoading: boolean;
}) {
  const rooms = res?.data.rooms ?? [];
  const live = !!res?.ok && rooms.some((r) => r.beds != null);

  return (
    <Section title="응급실 · 지금 남은 병상" right={<LiveDot live={live} />}>
      {isLoading && !res ? (
        <Skeleton rows={4} />
      ) : !res?.ok ? (
        <Unavailable reason={res?.notice} />
      ) : rooms.length === 0 ? (
        <Empty>의왕 근처 15km 안에서 응급실을 찾지 못했습니다.</Empty>
      ) : (
        <>
          {res.notice && <Notice>{res.notice}</Notice>}
          <ul>
            {rooms.map((r) => (
              <Row key={r.id} r={r} at={res.data.updatedAt} />
            ))}
          </ul>
          <p className="mt-3 text-[length:var(--text-2xs)] leading-relaxed text-[var(--text-faint)]">
            병원이 직접 올린 값이라 실제와 다를 수 있습니다. 위급하면 먼저 119 에 전화하세요.
          </p>
        </>
      )}
    </Section>
  );
}
