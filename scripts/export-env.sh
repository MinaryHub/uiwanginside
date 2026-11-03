#!/usr/bin/env bash
# 파이용 .env 를 만든다.
#
# 값의 출처가 둘이다.
#
#   .env.local   맥에 있는 실제 값. 여기가 비밀값의 출처다.
#   Vercel       프로덕션에만 있고 맥에는 없는 것을 메운다.
#
# Vercel 을 그대로 쓸 수 없다. `vercel env pull` 은 Sensitive 로 표시된 변수를
# 실제 값이 아니라 "[SENSITIVE]" 로 내려준다 — 이 프로젝트에서는 14개가 그렇다.
# 그대로 파이에 올리면 지도도 외부 API 도 전부 조용히 실패한다.
# 실제로 한 번 겪었다. 그래서 자리표시자는 아래에서 거부한다.
#
# 주소에 매인 것 하나만 바꾼다.
#   PUBLIC_URL → 파이의 공개 주소 (/status 가 카카오 도메인 등록을 진단할 때 쓴다)
#
# 결과 파일에는 비밀값이 들어 있다. 저장소에 넣지 말고 600 으로 둔다.
set -euo pipefail
cd "$(dirname "$0")/.."

OUT="${1:-deploy/.env.pi}"
DOMAIN="${DOMAIN:?DOMAIN 을 지정하세요 — 예: DOMAIN=uiwanginside.kimserv.com}"

[[ -f .env.local ]] || { echo "✗ .env.local 이 없습니다 — 비밀값의 출처입니다." >&2; exit 1; }

TMP="$(mktemp)"
trap 'rm -f "$TMP"' EXIT
# Vercel 쪽은 있으면 참고하고, 없어도 진행한다
npx vercel env pull "$TMP" --environment=production --yes >/dev/null 2>&1 || : > "$TMP"

python3 - "$TMP" "$OUT" "$DOMAIN" <<'PY'
import re, sys, os

vercel_file, out, domain = sys.argv[1], sys.argv[2], sys.argv[3]
LINE = re.compile(r'^([A-Z_0-9]+)\s*=\s*"?(.*?)"?\s*$', re.M)
# Vercel 이 빌드에 끼워 넣는 것 — 파이에서는 의미가 없거나 방해가 된다
DROP = re.compile(r'^(VERCEL|NX_|TURBO_)')
# Sensitive 변수를 가린 자리표시자
MASK = '[SENSITIVE]'


def read(path):
    if not os.path.exists(path):
        return {}
    text = open(path, encoding='utf-8').read()
    return {m.group(1): m.group(2) for m in LINE.finditer(text)}


local, remote = read('.env.local'), read(vercel_file)

env, source, masked = {}, {}, []
# Vercel 을 먼저 깔고 .env.local 로 덮는다 — 실제 값이 이깁니다
for name, val in remote.items():
    if DROP.match(name):
        continue
    if val == MASK:
        masked.append(name)
        continue
    env[name], source[name] = val, 'vercel'
for name, val in local.items():
    env[name], source[name] = val, 'local'

# 로그인 기능을 없애면서 쓸모가 없어진 것들. 남겨 두면 무엇에 쓰는지 헷갈린다
for name in ('AUTH_URL', 'AUTH_SECRET', 'NEXTAUTH_URL', 'NEXTAUTH_SECRET',
             'KAKAO_CLIENT_ID', 'KAKAO_CLIENT_SECRET', 'ADMIN_KAKAO_IDS',
             'BLOB_READ_WRITE_TOKEN'):
    env.pop(name, None)
    source.pop(name, None)
    if name in masked:
        masked.remove(name)

# PUBLIC_URL 은 여기서 정하므로 어디에 있었는지는 상관없다
env['PUBLIC_URL'] = f'https://{domain}'
source['PUBLIC_URL'] = '이 스크립트'

# 가려진 것 중 맥에도 없는 것은 값을 구할 데가 없다
lost = [n for n in masked if n not in env]

# 없으면 기능이 죽는 것들. AIRKOREA·EMERGENCY 는 KMA 키로 대체되므로 뺀다
REQUIRED = ('DATABASE_URL', 'PUBLIC_URL', 'NEXT_PUBLIC_KAKAO_JS_KEY', 'KAKAO_REST_KEY',
            'KMA_SERVICE_KEY', 'GBIS_SERVICE_KEY', 'GG_DATA_KEY')
missing = [n for n in REQUIRED if not env.get(n)]

if lost:
    print('✗ 값을 구할 수 없습니다 (Vercel 은 가려서 주고 .env.local 에도 없음):')
    for n in sorted(lost):
        print(f'    {n}')
    print('  Vercel 대시보드에서 값을 확인해 .env.local 에 넣고 다시 실행하세요.')
if missing:
    print('✗ 반드시 있어야 하는 값이 빠졌습니다:', ', '.join(missing))
if lost or missing:
    sys.exit(1)

with open(out, 'w', encoding='utf-8') as f:
    f.write('# scripts/export-env.sh 가 만든다. 비밀값이므로 저장소에 넣지 마세요.\n')
    f.write(f'# PUBLIC_URL = https://{domain}\n')
    for name in sorted(env):
        f.write(f'{name}="{env[name]}"\n')

n_local = sum(1 for v in source.values() if v == 'local')
print(f'{len(env)}개 기록 → {out}')
print(f'  .env.local {n_local}개 · Vercel {len(env) - n_local - 1}개 · PUBLIC_URL 1개')
if masked:
    print(f'  Vercel 이 가려서 준 {len(masked)}개는 .env.local 값으로 채웠습니다')
PY

chmod 600 "$OUT"
echo "→ 파이로: scp $OUT <파이>:~/uiwanginside/.env"
