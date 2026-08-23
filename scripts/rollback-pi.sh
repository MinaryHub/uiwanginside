#!/usr/bin/env bash
# 직전 이미지로 되돌린다.
#
# 레지스트리를 쓰지 않으므로 지난 이미지를 다시 받아올 곳이 없다. deploy-pi.sh
# 가 올리기 직전에 :prev 로 남겨 둔 것이 유일한 되돌림 지점이다 — 한 판만
# 남는다. 두 번 배포하면 그 전 것은 사라진다.
set -euo pipefail
PI="${PI:-knoxxr@192.168.75.107}"
REMOTE_DIR="${REMOTE_DIR:-uiwanginside}"

PREV="$(ssh -o BatchMode=yes "$PI" \
  "docker image inspect uiwanginside:prev --format '{{index .Config.Labels \"org.opencontainers.image.revision\"}}' 2>/dev/null" \
  2>/dev/null | tr -d '\r' || true)"
if [[ -z "$PREV" ]]; then
  echo "✗ 되돌릴 이미지(uiwanginside:prev)가 파이에 없습니다." >&2
  exit 1
fi

NOW="$(ssh -o BatchMode=yes "$PI" \
  "docker image inspect uiwanginside:latest --format '{{index .Config.Labels \"org.opencontainers.image.revision\"}}' 2>/dev/null" \
  2>/dev/null | tr -d '\r' || echo 알수없음)"

echo "  지금: $NOW  →  되돌릴 곳: $PREV"
read -r -p "  진행할까요? [y/N] " yn
[[ "$yn" == "y" || "$yn" == "Y" ]] || { echo "  취소했습니다."; exit 0; }

ssh -o BatchMode=yes "$PI" "
  docker tag uiwanginside:latest uiwanginside:failed
  docker tag uiwanginside:prev   uiwanginside:latest
  cd '$REMOTE_DIR' && docker compose up -d
"
sleep 8
ssh -o BatchMode=yes "$PI" "cd '$REMOTE_DIR' && docker compose ps --format '  {{.Service}}  {{.Status}}'"
echo "✓ $PREV 로 되돌렸습니다. 잘못된 것은 uiwanginside:failed 로 남겨 뒀습니다."
