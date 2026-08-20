#!/usr/bin/env bash
# 의왕 인사이드 → 라즈베리파이 배포.
#
# 맥에서 linux/arm64 이미지를 빌드해 SSH 로 파이에 밀어넣고 다시 올린다.
# 레지스트리를 쓰지 않는다 — 개인 서버 하나에 올리는 데 계정·인증을 붙일 이유가 없다.
#
# 왜 파이에서 빌드하지 않는가: Next 빌드는 파이에서 수십 분이 걸린다. Apple
# Silicon 은 linux/arm64 컨테이너를 에뮬레이션 없이 돌리므로 여기서 빌드하는 것이
# 빠르면서도 파이와 같은 산출물을 준다.
#
#   사용법:  PI=uiwang@192.168.0.50 ./scripts/deploy-pi.sh
#            PI=... SKIP_BUILD=1 ./scripts/deploy-pi.sh   # 이미지 재사용
set -euo pipefail

PI="${PI:?PI 를 지정하세요 — 예: PI=uiwang@192.168.0.50}"
REMOTE_DIR="${REMOTE_DIR:-/home/${PI##*@}/uiwanginside}"
IMAGE="uiwanginside:latest"
cd "$(dirname "$0")/.."

# NEXT_PUBLIC_* 은 빌드 시점에 클라이언트 번들로 박힌다. 여기서 빠지면 지도가
# 키 없이 빌드되어 배포 후 화면에서 조용히 실패한다 — 먼저 막는다.
KEY="${NEXT_PUBLIC_KAKAO_JS_KEY:-}"
if [[ -z "$KEY" && -f .env.local ]]; then
  KEY="$(grep -m1 '^NEXT_PUBLIC_KAKAO_JS_KEY=' .env.local | cut -d= -f2- | tr -d '"'"'"'')"
fi
if [[ -z "$KEY" ]]; then
  echo "✗ NEXT_PUBLIC_KAKAO_JS_KEY 가 없습니다. 이 값 없이 빌드하면 지도가 뜨지 않습니다." >&2
  exit 1
fi

if [[ -z "${SKIP_BUILD:-}" ]]; then
  echo "▶ linux/arm64 이미지 빌드"
  docker buildx build \
    --platform linux/arm64 \
    --build-arg "NEXT_PUBLIC_KAKAO_JS_KEY=$KEY" \
    -t "$IMAGE" --load .
fi

echo "▶ 파이로 전송 ($PI)"
ssh "$PI" "mkdir -p '$REMOTE_DIR'"
# 이미지를 파일로 남기지 않고 파이프로 넘긴다
docker save "$IMAGE" | gzip -1 | ssh "$PI" "gunzip | docker load"

echo "▶ 구성 파일 전송"
scp -q deploy/compose.yaml deploy/Caddyfile "$PI:$REMOTE_DIR/"

echo "▶ 재시작"
# --remove-orphans: 구성에서 빠진 컨테이너를 남겨두지 않는다
ssh "$PI" "cd '$REMOTE_DIR' && docker compose up -d --remove-orphans && docker image prune -f >/dev/null"

echo "▶ 상태"
ssh "$PI" "cd '$REMOTE_DIR' && docker compose ps"
echo "✓ 완료 — 도메인으로 접속해 지도가 뜨는지 확인하세요."
