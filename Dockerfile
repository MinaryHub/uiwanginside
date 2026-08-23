# syntax=docker/dockerfile:1

# 의왕 인사이드 — 라즈베리파이(Ubuntu Server, aarch64) 자체 호스팅 이미지.
#
# 왜 컨테이너로 빌드하는가: 맥(darwin-arm64)에서 빌드한 산출물을 파이(linux-arm64)로
# 그대로 옮기면 Next 의 플랫폼별 SWC 바이너리처럼 OS 가 다른 것에서 어긋난다.
# Apple Silicon 은 linux/arm64 컨테이너를 에뮬레이션 없이 돌리므로, 여기서
# --platform=linux/arm64 로 빌드하면 파이와 같은 산출물을 네이티브 속도로 얻는다.
#
# alpine 대신 slim(glibc) 을 쓴다 — musl 에서 나는 Next 의 자잘한 문제를 피한다.

# ---------------------------------------------------------------- 의존성
FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# npm ci 를 쓰지 못한다.
#
# 락 파일은 macOS 에서 만들어져 sharp·tailwind 의 linux 변종이 요구하는
# @emnapi/runtime 같은 하위 의존성이 들어 있지 않다. npm 은 다른 플랫폼의
# optional 의존성의 하위까지는 락에 적지 않아(--os/--cpu 로도 채워지지 않는다)
# linux 에서 npm ci 가 "lock file 과 맞지 않는다"며 멈춘다.
#
# 그래서 이 단계만 install 로 해석한다. 락에 있는 것은 그대로 고정되고,
# 빠진 플랫폼 변종만 여기서 채워진다.
RUN npm install --no-audit --no-fund

# ---------------------------------------------------------------- 빌드
FROM node:22-bookworm-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# NEXT_PUBLIC_* 은 클라이언트 번들에 그대로 박히므로 런타임이 아니라 빌드 시점에
# 있어야 한다. 없으면 지도가 키 없이 빌드되어 화면에서 조용히 실패한다.
ARG NEXT_PUBLIC_KAKAO_JS_KEY
ENV NEXT_PUBLIC_KAKAO_JS_KEY=${NEXT_PUBLIC_KAKAO_JS_KEY}

ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ---------------------------------------------------------------- 실행
FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
# 컨테이너 밖에서 들어오는 요청을 받으려면 루프백이 아니라 전체 인터페이스에 붙어야 한다
ENV HOSTNAME=0.0.0.0

# root 로 돌릴 이유가 없다
RUN groupadd --system --gid 1001 nodejs \
 && useradd --system --uid 1001 --gid nodejs nextjs

# standalone 은 server.js 와 최소 node_modules 만 담는다.
# static 과 public 은 따로 담기지 않으므로 직접 옮겨야 한다 — 빠뜨리면
# 페이지는 뜨는데 CSS·JS·이미지가 전부 404 가 된다.
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

# 어느 커밋으로 만든 이미지인지 새긴다.
#
# 이것이 없으면 파이에 무엇이 돌고 있는지 알 방법이 없다 — 올렸는지 안
# 올렸는지 몰라 같은 것을 두 번 올리게 된다. 라벨은 배포 스크립트가 읽고,
# 환경변수는 /api/version 이 읽는다.
#
# COPY 뒤에 두는 이유: 매번 바뀌는 값이라 앞에 두면 그 아래 층이 전부
# 다시 만들어진다.
ARG GIT_SHA=unknown
ARG BUILT_AT=unknown
ENV BUILD_SHA=${GIT_SHA}
ENV BUILT_AT=${BUILT_AT}
LABEL org.opencontainers.image.revision=${GIT_SHA}
LABEL org.opencontainers.image.created=${BUILT_AT}

USER nextjs
EXPOSE 3000

# 외부 API 키 상태까지 점검하는 /api/health 는 무겁고 느리다. 살아있는지만
# 보면 되므로 가장 싼 경로를 찔러 본다.
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
