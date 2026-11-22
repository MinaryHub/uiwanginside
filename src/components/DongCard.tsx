"use client";

import Icon from "@/components/Icon";
import { DONG_POPULATION, POPULATION_AS_OF, TOTAL_POPULATION, density } from "@/lib/population";
import { HAS_DONG_SCHEDULE } from "@/lib/waste";

/**
 * 동을 고르면 그 동에 대해 아는 것을 한 자리에 모아 보여준다.
 *
 * 지금까지는 동을 눌러도 경계선만 그려졌고, 인구는 생활 모드 안쪽
 * 인구 패널에서 여섯 줄 가운데 하나를 눈으로 찾아야 했다. 지도에서
 * 고른 동의 이야기가 지도 위에 없었다.
 *
 * 없는 것은 없다고 적는다. 쓰레기 배출요일을 동별로 기대하기 쉬운데
 * 의왕시는 동별 일정을 공표하지 않는다 — 지어내는 대신 시 전체가
 * 같다는 사실을 알린다.
 */
export default function DongCard({
  name,
  factoryCount,
  onClose,
  onOpenWaste,
}: {
  name: string;
  factoryCount?: number;
  onClose: () => void;
  onOpenWaste: () => void;
}) {
  const d = DONG_POPULATION.find((x) => x.name === name);
  if (!d) return null;

  const perKm = density(d.population, d.area);
  const share = ((d.population / TOTAL_POPULATION) * 100).toFixed(1);

  return (
    <div className="pop-in absolute inset-x-3 bottom-[calc(var(--dock-h)+8px)] z-30 mx-auto max-w-[440px] overflow-hidden rounded-[var(--radius-xl)] border-2 border-[var(--ink)] bg-[var(--surface)] shadow-[var(--shadow-lg)]">
      <div className="flex items-center gap-2 px-3.5 pt-3">
        <h2 className="min-w-0 flex-1 truncate text-[length:var(--text-base)] font-bold">
          {d.name}
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="닫기"
          className="press grid h-11 w-11 shrink-0 place-items-center rounded-[var(--radius-full)] text-[var(--text-muted)] transition hover:bg-[var(--surface-2)] hover:text-[var(--text)]"
        >
          <Icon name="close" size={18} />
        </button>
      </div>

      <dl className="grid grid-cols-3 gap-2 px-3.5 pt-1.5">
        {[
          ["인구", d.population.toLocaleString("ko-KR"), "명"],
          ["면적", d.area.toLocaleString("ko-KR"), "km²"],
          ["인구밀도", perKm.toLocaleString("ko-KR"), "명/km²"],
        ].map(([label, v, unit]) => (
          <div key={label} className="rounded-[var(--radius)] bg-[var(--surface-2)] px-2.5 py-2">
            <dt className="text-[length:var(--text-2xs)] font-semibold text-[var(--text-muted)]">
              {label}
            </dt>
            <dd className="mt-0.5 truncate text-[length:var(--text-base)] font-bold tabular-nums">
              {v}
              <span className="ml-0.5 text-[length:var(--text-2xs)] font-bold text-[var(--text-muted)]">
                {unit}
              </span>
            </dd>
          </div>
        ))}
      </dl>

      <p className="px-3.5 pt-2 text-[length:var(--text-xs)] leading-relaxed text-[var(--text-muted)]">
        의왕시 인구의 <b className="text-[var(--text)]">{share}%</b>
        {factoryCount != null && factoryCount > 0 && (
          <>
            {" · 등록 공장 "}
            <b className="text-[var(--text)]">{factoryCount.toLocaleString("ko-KR")}곳</b>
          </>
        )}
        {" · 법정동 "}
        {d.legalDongs.join(", ")}
      </p>

      {/* 동별로 있을 것 같지만 없는 정보. 기대를 바로잡아 준다. */}
      {!HAS_DONG_SCHEDULE && (
        <button
          type="button"
          onClick={onOpenWaste}
          className="mt-2 flex min-h-[44px] w-full items-center gap-1.5 border-t border-[var(--border)] px-3.5 py-2.5 text-left text-[length:var(--text-xs)] transition hover:bg-[var(--surface-2)]"
        >
          <span aria-hidden>🗑️</span>
          <span className="flex-1 text-[var(--text-muted)]">
            쓰레기 배출은 의왕시 전체가 같습니다
          </span>
          <span className="shrink-0 font-bold text-[var(--brand)]">보기 →</span>
        </button>
      )}

      <p className="px-3.5 pb-2.5 pt-1.5 text-[length:var(--text-2xs)] text-[var(--text-faint)]">
        인구 {POPULATION_AS_OF} 기준 · 행정안전부 주민등록인구통계
      </p>
    </div>
  );
}
