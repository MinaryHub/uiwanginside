#!/usr/bin/env bash
# 파이에서 최신으로 올린다. 이 파일은 파이의 ~/uiwanginside 에 둔다.
#
#   ./update.sh          받아서 바뀐 것이 있으면 올린다
#   FORCE=1 ./update.sh  같아도 다시 올린다
#
# 빌드하지 않는다. GitHub 이 만들어 둔 것을 받아오기만 한다 — 파이에서 빌드하면
# SD 카드가 차거나 램이 모자라 죽는다.
set -euo pipefail
cd "$(dirname "$0")"

IMAGE="${UIWANG_IMAGE:-ghcr.io/minaryhub/uiwanginside}"

sha_of() {
  docker image inspect "$1" \
    --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' 2>/dev/null \
    | cut -c1-7 | tr -d '\r'
}

BEFORE="$(sha_of "$IMAGE:latest" || true)"
echo "지금 도는 것: ${BEFORE:-없음}"

# 받아오기 전에 지금 것을 :prev 로 남긴다. 받아오면 latest 태그가 새 이미지로
# 옮겨가 버려, 그 전에 표를 붙여두지 않으면 되돌아갈 곳을 잃는다.
if docker image inspect "$IMAGE:latest" >/dev/null 2>&1; then
  docker tag "$IMAGE:latest" "$IMAGE:prev"
fi

echo "받아오는 중…"
if ! docker compose pull app; then
  echo
  echo "✗ 받아오지 못했습니다." >&2
  echo "  비공개 패키지라 로그인이 필요합니다. 한 번만 해두면 됩니다:" >&2
  echo "    echo <토큰> | docker login ghcr.io -u <깃허브아이디> --password-stdin" >&2
  echo "  토큰은 github.com/settings/tokens 에서 read:packages 권한으로 만듭니다." >&2
  exit 1
fi

AFTER="$(sha_of "$IMAGE:latest" || true)"
echo "받아온 것:    ${AFTER:-알수없음}"

if [[ "$BEFORE" == "$AFTER" && -z "${FORCE:-}" ]]; then
  echo
  echo "✓ 이미 최신입니다 ($AFTER). 올릴 것이 없습니다."
  echo "  그래도 다시 올리려면 FORCE=1 을 붙이세요."
  exit 0
fi

echo "바꿔 올리는 중…"
docker compose up -d
# 태그가 붙은 :prev 는 지워지지 않는다
docker image prune -f >/dev/null

# 컨테이너 안에서 직접 물어본다. 집 안에서는 공인 IP 로 돌아올 수 없다
# (공유기가 헤어핀 NAT 을 하지 않는다).
for _ in $(seq 1 20); do
  sleep 2
  RUNNING="$(docker exec uiwanginside node -e \
    "fetch('http://127.0.0.1:3000/api/version').then(r=>r.json()).then(v=>console.log(v.sha.slice(0,7))).catch(()=>process.exit(1))" \
    2>/dev/null || true)"
  [[ -n "$RUNNING" ]] && break
done

docker compose ps --format '  {{.Service}}  {{.Status}}'
if [[ "$RUNNING" == "$AFTER" ]]; then
  echo "✓ $AFTER 가 돌고 있습니다."
else
  echo "⚠ 올린 것은 $AFTER 인데 도는 것은 ${RUNNING:-확인불가} 입니다." >&2
  echo "  로그: docker compose logs -f app" >&2
  echo "  되돌리기: ./rollback.sh" >&2
  exit 1
fi
