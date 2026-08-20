#!/usr/bin/env bash
# Vercel 프로덕션 환경변수를 파이용 .env 로 뽑아낸다.
#
# Vercel 을 대체하는 것이므로 값 자체는 그대로 쓰되, 주소에 매인 두 개만 바꿔야 한다.
#   AUTH_URL            → 파이의 공개 주소 (NextAuth 가 리다이렉트를 만들 때 쓴다)
#   VERCEL_*            → 의미 없으므로 걸러낸다
#
# 결과 파일에는 비밀값이 들어 있다. 저장소에 넣지 말고 600 으로 둔다.
set -euo pipefail
cd "$(dirname "$0")/.."

OUT="${1:-deploy/.env.pi}"
DOMAIN="${DOMAIN:?DOMAIN 을 지정하세요 — 예: DOMAIN=uiwang.example.com}"

TMP="$(mktemp)"
trap 'rm -f "$TMP"' EXIT
npx vercel env pull "$TMP" --environment=production --yes >/dev/null

python3 - "$TMP" "$OUT" "$DOMAIN" <<'PY'
import re, sys
src, out, domain = sys.argv[1], sys.argv[2], sys.argv[3]
text = open(src, encoding='utf-8').read()

# Vercel 이 빌드에 끼워 넣는 것들 — 파이에서는 의미가 없거나 방해가 된다
drop = re.compile(r'^(VERCEL|NX_|TURBO_)')
kept, skipped = [], []
for m in re.finditer(r'^([A-Z_0-9]+)="((?:[^"\\]|\\.)*)"$', text, re.M):
    name, val = m.group(1), m.group(2)
    if drop.match(name):
        skipped.append(name); continue
    if name == 'AUTH_URL':
        val = f'https://{domain}'      # 주소에 매인 값은 새 도메인으로
    kept.append((name, val))

with open(out, 'w', encoding='utf-8') as f:
    f.write('# Vercel 프로덕션에서 옮긴 값. 비밀값이므로 저장소에 넣지 마세요.\n')
    f.write(f'# AUTH_URL 은 https://{domain} 으로 바꿨습니다.\n')
    for name, val in kept:
        f.write(f'{name}="{val}"\n')

print(f'{len(kept)}개 기록 → {out}')
print('걸러낸 것:', ', '.join(sorted(set(skipped))) or '없음')
names = {n for n, _ in kept}
for need in ('DATABASE_URL', 'AUTH_SECRET', 'AUTH_URL',
             'BLOB_READ_WRITE_TOKEN', 'NEXT_PUBLIC_KAKAO_JS_KEY',
             'KAKAO_CLIENT_ID', 'KAKAO_CLIENT_SECRET'):
    if need not in names:
        print(f'⚠ 빠짐: {need}')
PY

chmod 600 "$OUT"
echo "→ 파이로: scp $OUT <파이>:~/uiwanginside/.env"
