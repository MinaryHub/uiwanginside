import { createHash, timingSafeEqual } from "node:crypto";

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

const sha256 = (s: string) => createHash("sha256").update(s, "utf8").digest();

/**
 * 시간차로 길이·글자를 추론하는 것을 막기 위해 양쪽을 해시한 뒤 상수 시간 비교한다.
 */
export function matchesStatsToken(given: string): boolean {
  const want = statsToken();
  if (!want) return false;
  return timingSafeEqual(sha256(given), sha256(want));
}
