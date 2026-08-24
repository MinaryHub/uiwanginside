#!/usr/bin/env bash
# 파이를 최신 버전으로 올린다. 배포 PC 에서 이것 하나만 실행하면 된다.
#
#   ./scripts/update-pi.sh
#
# deploy-pi.sh 와 나눈 이유: deploy-pi.sh 는 "지금 이 작업트리를 올린다" 이고
# 이것은 "저장소의 최신을 올린다" 이다. 개발 중에 시험 삼아 올릴 때와, 그냥
# 최신으로 맞출 때는 원하는 것이 다르다.
#
# 하는 일
#   1. origin 에서 최신을 받아 온다 (앞서 있으면 그대로 둔다)
#   2. 파이에 도는 커밋과 올릴 커밋을 비교한다 — 같으면 아무것도 하지 않는다
#   3. 환경변수가 달라졌으면 그것도 함께 보낸다
#   4. 빌드해 올리고, 정말 그 커밋이 도는지 확인한다
#
# 환경
#   PI       파이 주소            (기본 knoxxr@192.168.75.107)
#   DOMAIN   공개 주소            (기본 uiwanginside.kimserv.com)
#   FORCE=1  같은 커밋이어도 다시 올린다
set -euo pipefail
cd "$(dirname "$0")/.."

PI="${PI:-knoxxr@192.168.75.107}"
DOMAIN="${DOMAIN:-uiwanginside.kimserv.com}"
REMOTE_DIR="${REMOTE_DIR:-uiwanginside}"
BRANCH="${BRANCH:-main}"

step() { printf '\n\033[1m%s\033[0m\n' "$1"; }

# ── 1. 최신 받아오기 ────────────────────────────────────────
step "1/4  저장소 최신 확인"
# 추적되지 않은 파일도 본다. Docker 는 COPY . . 로 그것까지 담으므로,
# 커밋하지 않은 새 파일이 이미지에 들어가면서 새겨지는 커밋 해시는 그
# 파일이 없던 시점을 가리키게 된다 — 무엇이 도는지 알 수 없어진다.
UNTRACKED="$(git ls-files --others --exclude-standard)"
if ! git diff --quiet || ! git diff --cached --quiet || [[ -n "$UNTRACKED" ]]; then
  echo "  ✗ 커밋하지 않은 변경이 있습니다. 무엇이 올라갈지 분명하지 않습니다." >&2
  git status --short | sed 's/^/    /' >&2
  echo "  커밋하거나 되돌린 뒤 다시 실행하세요. 지금 트리를 그대로 올리려면 deploy-pi.sh 를 쓰세요." >&2
  exit 1
fi

git fetch --quiet origin "$BRANCH"
BEHIND="$(git rev-list --count "HEAD..origin/$BRANCH")"
AHEAD="$(git rev-list --count "origin/$BRANCH..HEAD")"

if [[ "$BEHIND" -gt 0 ]]; then
  if [[ "$AHEAD" -gt 0 ]]; then
    echo "  ✗ 갈라졌습니다 — 앞선 커밋 $AHEAD 개, 뒤진 커밋 $BEHIND 개." >&2
    echo "  손으로 정리한 뒤 다시 실행하세요." >&2
    exit 1
  fi
  echo "  $BEHIND 개 뒤져 있어 받아옵니다"
  git merge --ff-only "origin/$BRANCH" | sed 's/^/    /'
elif [[ "$AHEAD" -gt 0 ]]; then
  echo "  origin 보다 $AHEAD 개 앞서 있습니다 — 이 상태를 올립니다"
else
  echo "  이미 origin/$BRANCH 와 같습니다"
fi

TARGET="$(git rev-parse --short HEAD)"
echo "  올릴 것: $TARGET  $(git log -1 --format='%s' | cut -c1-56)"

# ── 2. 파이에 도는 것 ───────────────────────────────────────
step "2/4  파이에 도는 버전"
RUNNING="$(ssh -n -o BatchMode=yes "$PI" \
  "docker image inspect uiwanginside:latest --format '{{index .Config.Labels \"org.opencontainers.image.revision\"}}' 2>/dev/null" \
  2>/dev/null | tr -d '\r' || true)"
RUNNING="${RUNNING:-없음}"
echo "  도는 것: $RUNNING"

# ── 3. 환경변수가 달라졌는지 ────────────────────────────────
step "3/4  환경변수"
DOMAIN="$DOMAIN" ./scripts/export-env.sh >/dev/null
MINE="$(shasum -a 256 deploy/.env.pi | cut -d' ' -f1)"
THEIRS="$(ssh -n -o BatchMode=yes "$PI" "sha256sum '$REMOTE_DIR/.env' 2>/dev/null | cut -d' ' -f1" || true)"
ENV_CHANGED=0
if [[ "$MINE" != "$THEIRS" ]]; then
  ENV_CHANGED=1
  echo "  달라졌습니다 — 함께 보냅니다"
else
  echo "  그대로입니다"
fi

if [[ "$RUNNING" == "$TARGET" && "$ENV_CHANGED" -eq 0 && -z "${FORCE:-}" ]]; then
  echo
  echo "✓ 이미 최신입니다 ($TARGET). 올릴 것이 없습니다."
  echo "  그래도 다시 올리려면 FORCE=1 을 붙이세요."
  exit 0
fi

if [[ "$ENV_CHANGED" -eq 1 ]]; then
  ssh -n -o BatchMode=yes "$PI" "mkdir -p '$REMOTE_DIR'"
  scp -q deploy/.env.pi "${PI}:${REMOTE_DIR}/.env"
  ssh -n -o BatchMode=yes "$PI" "chmod 600 '$REMOTE_DIR/.env'"
fi

# ── 4. 올리기 ───────────────────────────────────────────────
step "4/4  배포"
PI="$PI" REMOTE_DIR="$REMOTE_DIR" ./scripts/deploy-pi.sh

echo
echo "  https://$DOMAIN/api/version 에서 확인할 수 있습니다"
echo "  되돌리려면: PI=$PI ./scripts/rollback-pi.sh"
echo
echo "  참고: 평소에는 파이에서 './update.sh' 만 하면 됩니다."
echo "        이 스크립트는 GitHub 빌드를 기다리지 않고 급히 올릴 때 쓰는 길입니다."
