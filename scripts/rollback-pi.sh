#!/usr/bin/env bash
# 직전 이미지로 되돌린다.
#
# 레지스트리를 쓰지 않으므로 지난 이미지를 다시 받아올 곳이 없다. deploy-pi.sh
# 가 올리기 직전에 :prev 로 남겨 둔 것이 유일한 되돌림 지점이다 — 한 판만
# 남는다. 두 번 배포하면 그 전 것은 사라진다.
set -euo pipefail
PI="${PI:-knoxxr@192.168.75.107}"
REMOTE_DIR="${REMOTE_DIR:-uiwanginside}"

# 이미지가 있는지와 라벨이 붙어 있는지는 다른 문제다. 라벨을 새기기 전에
# 만든 이미지는 되돌릴 수 있는데도 라벨이 비어 있다 — 그걸 "없다" 로 보면
# 정작 필요할 때 안전망이 거부한다.
if ! ssh -n -o BatchMode=yes "$PI" "docker image inspect uiwanginside:prev >/dev/null 2>&1"; then
  echo "✗ 되돌릴 이미지(uiwanginside:prev)가 파이에 없습니다." >&2
  echo "  아직 한 번도 덮어쓴 적이 없거나, 파이를 새로 깐 뒤 첫 배포입니다." >&2
  exit 1
fi

PREV="$(ssh -n -o BatchMode=yes "$PI" \
  "docker image inspect uiwanginside:prev --format '{{index .Config.Labels \"org.opencontainers.image.revision\"}}' 2>/dev/null" \
  2>/dev/null | tr -d '\r' || true)"
PREV="${PREV:-알수없음(라벨을 새기기 전 이미지)}"

NOW="$(ssh -n -o BatchMode=yes "$PI" \
  "docker image inspect uiwanginside:latest --format '{{index .Config.Labels \"org.opencontainers.image.revision\"}}' 2>/dev/null" \
  2>/dev/null | tr -d '\r' || echo 알수없음)"

echo "  지금: $NOW  →  되돌릴 곳: $PREV"
# 입력이 없으면(파이프·스크립트) 되돌리지 않는다. 되돌리기는 사람이
# 분명히 그렇게 하겠다고 해야 하는 일이다.
yn=""
read -r -p "  진행할까요? [y/N] " yn || true
[[ "$yn" == "y" || "$yn" == "Y" ]] || { echo "  취소했습니다."; exit 0; }

ssh -n -o BatchMode=yes "$PI" "
  docker tag uiwanginside:latest uiwanginside:failed
  docker tag uiwanginside:prev   uiwanginside:latest
  cd '$REMOTE_DIR' && docker compose up -d
"
sleep 8
ssh -n -o BatchMode=yes "$PI" "cd '$REMOTE_DIR' && docker compose ps --format '  {{.Service}}  {{.Status}}'"
echo "✓ $PREV 로 되돌렸습니다. 잘못된 것은 uiwanginside:failed 로 남겨 뒀습니다."
