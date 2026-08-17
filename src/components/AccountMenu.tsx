"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { signOut } from "next-auth/react";

export interface HeaderUser {
  name: string | null;
  image: string | null;
}

/**
 * 계정 메뉴.
 *
 * 전에는 ☰(리스트)·▣(사진) 두 버튼이 헤더에 나와 있었고, 로그인하지
 * 않았으면 눌러야 로그인 화면으로 튕겼다. 무엇이 잠겨 있는지도, 지금
 * 로그인 상태인지도 화면에 없었다.
 *
 * 둘을 하나로 접었다. 헤더 버튼이 다섯에서 넷으로 줄어 좁은 화면에서
 * 날씨 줄이 숨 쉴 자리가 생기고, 사진(로그인) 자리가 곧 상태 표시다.
 */
export default function AccountMenu({
  user,
  className,
}: {
  user: HeaderUser | null;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  // 바깥을 누르면 닫힌다 — 메뉴가 열린 채로 지도를 만지면 성가시다
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const item =
    "block min-h-[44px] w-full px-3.5 text-left text-[var(--text-sm)] font-semibold leading-[44px] transition hover:bg-[var(--surface-2)]";

  return (
    <div ref={boxRef} className="pointer-events-auto relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        title={user ? (user.name ?? "내 계정") : "로그인"}
        aria-label={user ? (user.name ?? "내 계정") : "로그인"}
        className={className}
        style={user ? { borderColor: "var(--brand)" } : undefined}
      >
        {user?.image ? (
          // 카카오 프로필은 외부 도메인이라 next/image 최적화를 거치지 않는다
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={user.image}
            alt=""
            className="h-7 w-7 rounded-full object-cover"
            referrerPolicy="no-referrer"
          />
        ) : (
          <span aria-hidden>{user ? "🙂" : "👤"}</span>
        )}
      </button>

      {open && (
        <div
          role="menu"
          className="fade-up absolute right-0 top-12 w-44 overflow-hidden rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-lg)]"
        >
          {user ? (
            <>
              <p className="truncate border-b border-[var(--border)] px-3.5 py-2 text-[var(--text-2xs)] text-[var(--text-muted)]">
                {user.name ?? "로그인됨"}
              </p>
              <Link href="/lists" className={item} onClick={() => setOpen(false)}>
                ☰ 내 장소 리스트
              </Link>
              <Link href="/gallery" className={item} onClick={() => setOpen(false)}>
                ▣ 내 사진
              </Link>
              {/*
                링크로 걸면 Auth.js 의 "정말 로그아웃하시겠습니까" 화면을
                한 번 거친다. 지도를 보다가 페이지가 통째로 바뀌는 것보다
                제자리에서 끝나는 편이 낫다.
              */}
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  void signOut({ callbackUrl: "/" });
                }}
                className={`${item} border-t border-[var(--border)] text-[var(--text-muted)]`}
              >
                로그아웃
              </button>
            </>
          ) : (
            <>
              <p className="border-b border-[var(--border)] px-3.5 py-2 text-[var(--text-2xs)] leading-relaxed text-[var(--text-muted)]">
                로그인하면 사진을 올리고
                <br />
                나만의 장소 리스트를 만들 수 있습니다.
              </p>
              <Link href="/login" className={item} onClick={() => setOpen(false)}>
                카카오로 로그인
              </Link>
            </>
          )}
        </div>
      )}
    </div>
  );
}
