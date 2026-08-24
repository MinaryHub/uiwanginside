#!/usr/bin/env bash
# 직전 이미지로 되돌린다. 파이의 ~/uiwanginside 에 둔다.
#
# update.sh 가 받아오기 전에 :prev 로 남겨 둔 것이 되돌림 지점이다.
# 한 판만 남는다 — 두 번 받아오면 그 전 것은 사라진다.
#
# 더 옛 판으로 가려면 커밋 해시 태그를 직접 받아온다:
#   docker pull ghcr.io/minaryhub/uiwanginside:<40자 커밋해시>
#   그 뒤 .env 에 TAG=<해시> 를 적고 docker compose up -d
set -euo pipefail
cd "$(dirname "$0")"

IMAGE="${UIWANG_IMAGE:-ghcr.io/minaryhub/uiwanginside}"
sha_of() {
  docker image inspect "$1" \
    --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' 2>/dev/null \
    | cut -c1-7 | tr -d '\r'
}

if ! docker image inspect "$IMAGE:prev" >/dev/null 2>&1; then
  echo "✗ 되돌릴 이미지($IMAGE:prev)가 없습니다." >&2
  echo "  아직 한 번도 덮어쓴 적이 없습니다." >&2
  exit 1
fi

echo "  지금: $(sha_of "$IMAGE:latest")  →  되돌릴 곳: $(sha_of "$IMAGE:prev")"
yn=""
read -r -p "  진행할까요? [y/N] " yn || true
[[ "$yn" == "y" || "$yn" == "Y" ]] || { echo "  취소했습니다."; exit 0; }

docker tag "$IMAGE:latest" "$IMAGE:failed"
docker tag "$IMAGE:prev" "$IMAGE:latest"
docker compose up -d
sleep 8
docker compose ps --format '  {{.Service}}  {{.Status}}'
echo "✓ 되돌렸습니다. 잘못된 것은 $IMAGE:failed 로 남겨 뒀습니다."
