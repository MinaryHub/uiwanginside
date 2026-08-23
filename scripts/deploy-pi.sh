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
# 홈 기준 상대 경로다. 절대 경로를 만들려고 PI 에서 사용자명을 잘라내면
# ${PI##*@} 처럼 잘못 잘라 /home/192.168.75.107 같은 곳을 만든다 — 겪었다.
REMOTE_DIR="${REMOTE_DIR:-uiwanginside}"
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

# 어느 커밋으로 만든 이미지인지 새겨 둔다. 파이에서 무엇이 도는지 알아야
# 올렸는지 안 올렸는지 헷갈리지 않는다.
GIT_SHA="$(git rev-parse --short HEAD 2>/dev/null || echo unknown)"
if ! git diff --quiet HEAD 2>/dev/null; then GIT_SHA="$GIT_SHA+수정본"; fi
BUILT_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

if [[ -z "${SKIP_BUILD:-}" ]]; then
  echo "▶ linux/arm64 이미지 빌드 ($GIT_SHA)"
  docker buildx build \
    --platform linux/arm64 \
    --build-arg "NEXT_PUBLIC_KAKAO_JS_KEY=$KEY" \
    --build-arg "GIT_SHA=$GIT_SHA" \
    --build-arg "BUILT_AT=$BUILT_AT" \
    -t "$IMAGE" --load .
fi

echo "▶ 파이로 전송 ($PI)"
ssh -n "$PI" "mkdir -p '$REMOTE_DIR'"

# 지금 도는 이미지를 :prev 로 남긴다. 새 것이 잘못됐을 때 되돌릴 유일한
# 수단이다 — 레지스트리를 쓰지 않으므로 지난 이미지를 다시 받아올 곳이 없다.
ssh -n "$PI" "docker image inspect '$IMAGE' >/dev/null 2>&1 && docker tag '$IMAGE' uiwanginside:prev || true"
# 이미지를 파일로 남기지 않고 파이프로 넘긴다
docker save "$IMAGE" | gzip -1 | ssh "$PI" "gunzip | docker load"

echo "▶ 구성 파일 전송"
scp -q deploy/compose.yaml deploy/Caddyfile "$PI:$REMOTE_DIR/"

echo "▶ 재시작"
# --remove-orphans: 구성에서 빠진 컨테이너를 남겨두지 않는다
ssh -n "$PI" "cd '$REMOTE_DIR' && docker compose up -d --remove-orphans && docker image prune -f >/dev/null"

echo "▶ 확인"
# 컨테이너 안에서 직접 물어본다. 집 안에서는 공인 IP 로 돌아올 수 없어
# (공유기가 헤어핀 NAT 을 하지 않는다) 바깥 주소로는 확인이 안 된다.
ssh -n "$PI" "cd '$REMOTE_DIR' && docker compose ps --format '  {{.Service}}  {{.Status}}'"
RUNNING="$(ssh -n "$PI" "docker exec uiwanginside node -e \"fetch('http://127.0.0.1:3000/api/version').then(r=>r.json()).then(v=>console.log(v.sha)).catch(()=>console.log('확인불가'))\"" 2>/dev/null || echo 확인불가)"
if [[ "$RUNNING" == "$GIT_SHA" ]]; then
  echo "✓ $GIT_SHA 가 돌고 있습니다."
else
  echo "⚠ 올린 것은 $GIT_SHA 인데 도는 것은 $RUNNING 입니다." >&2
  echo "  컨테이너가 아직 뜨는 중일 수 있습니다: ssh $PI 'cd $REMOTE_DIR && docker compose logs -f app'" >&2
fi
