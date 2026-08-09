/**
 * 의왕 인사이드 심볼.
 *
 * 의왕시가 스스로 밝힌 상징 요소를 모티프로 새로 그렸다.
 *   원      의왕의 'ㅇ' — 천·지·인의 합일
 *   세 봉우리 세 지역의 자연과 화합
 *   떠오르는 해 발전하는 도시
 *
 * 공식 휘장(CI)을 복제하지 않았다. 이 포털은 시가 만든 공식 서비스가 아니라
 * 시민이 만든 것이라, 공식 마크를 그대로 쓰면 공식 서비스로 오인될 수 있다.
 */
export default function Logo({
  size = 28,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      className={className}
      role="img"
      aria-label="의왕 인사이드"
    >
      <defs>
        <clipPath id="uiwang-logo-clip">
          <circle cx="16" cy="16" r="15" />
        </clipPath>
      </defs>

      {/* 원 — 의왕의 'ㅇ' */}
      <circle cx="16" cy="16" r="15" fill="#0f6b60" />

      <g clipPath="url(#uiwang-logo-clip)">
        {/* 떠오르는 해 — 봉우리 뒤에 두어 능선 위로 걸치게 한다 */}
        <circle cx="16" cy="13.5" r="4.4" fill="#f2b23e" />

        {/* 세 봉우리 — 가운데를 높여 하나의 산으로 묶는다 */}
        <path
          d="M-2 34 L6.5 21.5 L11 26 L16 16.5 L21.5 25 L26 20.5 L34 34 Z"
          fill="#ffffff"
        />
      </g>
    </svg>
  );
}
