import { timingSafeEqual } from "node:crypto";

/**
 * 로그인 없이 접속 통계를 여는 비밀 주소.
 *
 * 로그인 기능이 없으므로 통계는 이 길로만 본다. 폰에서 즐겨찾기 하나로
 * 숫자를 볼 수 있다. 주소 자체가 열쇠다.
 *
 * 주소가 곧 열쇠라는 것은 이런 뜻이다.
 *  - 이 주소를 아는 사람은 누구나 본다. 남에게 보내면 그 사람도 본다
 *  - 브라우저 기록·서버 접속 로그에 주소가 남는다 (파이의 Caddy 로그)
 *  - 그래서 통계만 보여준다. 이 주소로는 아무것도 바꿀 수 없다
 *
 * 없으면 기능 자체가 없는 것으로 친다 — 주소를 찔러 봐도 404 다.
 */

/** 찍어서 맞히기 어려울 만큼은 길어야 한다 */
const MIN_LEN = 24;

let warned = false;

export function statsToken(): string | null {
  const raw = (process.env.STATS_TOKEN ?? "").trim();
  if (!raw) return null;
  if (raw.length < MIN_LEN) {
    // 짧은 토큰은 없느니만 못하다. 조용히 받아들이지 않는다.
    if (!warned) {
      warned = true;
      console.warn(`[stats] STATS_TOKEN 이 ${raw.length}자입니다. ${MIN_LEN}자 이상이어야 씁니다.`);
    }
    return null;
  }
  return raw;
}

export function statsLinkEnabled(): boolean {
  return statsToken() !== null;
}

/**
 * 시간차로 한 글자씩 맞혀 나가는 것을 막으려면 앞에서 끊지 않고 끝까지 비교해야
 * 한다. 길이는 어차피 주소를 보면 드러나므로 먼저 걸러도 잃을 것이 없다.
 */
export function matchesStatsToken(given: string): boolean {
  const want = statsToken();
  if (!want) return false;
  const a = Buffer.from(given, "utf8");
  const b = Buffer.from(want, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
