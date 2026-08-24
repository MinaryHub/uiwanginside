#!/usr/bin/env bash
# 파이를 직전 이미지로 되돌린다.
#
# 실제 되돌리기는 파이의 ~/uiwanginside/rollback.sh 가 한다. 여기서 같은 일을
# 또 구현하면 이미지 이름 같은 것이 갈라져, 정작 필요할 때 엉뚱한 것을
# 가리킨다 — 한 번 겪었다. 이 파일은 그것을 불러주는 것뿐이다.
#
#   PI=knoxxr@192.168.75.107 ./scripts/rollback-pi.sh
set -euo pipefail
PI="${PI:-knoxxr@192.168.75.107}"
REMOTE_DIR="${REMOTE_DIR:-uiwanginside}"

# -t 로 터미널을 붙인다. 파이 쪽이 "진행할까요" 를 묻는다.
exec ssh -t "$PI" "cd '$REMOTE_DIR' && ./rollback.sh"
