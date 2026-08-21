# 라즈베리파이 배포

Vercel 을 대체해 파이(Ubuntu Server, aarch64)에서 직접 돌린다.

## 왜 이런 구성인가

**맥에서 빌드해 파이로 보낸다.** Next 빌드는 파이에서 수십 분이 걸린다. Apple
Silicon 은 `linux/arm64` 컨테이너를 에뮬레이션 없이 돌리므로, 맥에서 빌드하면
파이와 같은 산출물을 네이티브 속도로 얻는다. 파이는 실행만 한다.

산출물을 그냥 `rsync` 하지 않고 컨테이너로 옮기는 이유는 OS 다. 맥에서 만든
`node_modules` 에는 darwin 용 네이티브 바이너리가 섞이고, Next 는 플랫폼별 SWC
바이너리를 쓴다. 컨테이너 안에서 linux 로 설치·빌드해야 어긋나지 않는다.

레지스트리는 쓰지 않는다. 서버 하나에 올리는 데 계정과 인증을 붙일 이유가 없어,
`docker save | ssh docker load` 로 바로 넘긴다.

## 이 앱이 자체 호스팅에 유리한 점

- Vercel 전용 런타임 API(`@vercel/functions`·`geolocation()`·`waitUntil()`)를 쓰지 않는다
- 모든 페이지가 `force-dynamic` — ISR·캐시 재검증 문제가 없다
- `@vercel/blob` 이 `BLOB_READ_WRITE_TOKEN` 방식이라 Vercel 밖에서도 그대로 쓴다
- `@neondatabase/serverless` 는 HTTP 드라이버라 어디서든 붙는다
- `next/image` 를 쓰지 않아 `sharp`·`remotePatterns` 문제가 없다

## 준비 (한 번만)

### 1. 카카오 개발자 콘솔 — 빠뜨리면 지도가 안 뜬다

지도 JS 키는 **도메인 제한**이 걸린다. 등록하지 않은 도메인에서는 지도가 아예
그려지지 않는다. 이 앱은 지도가 본체라 사실상 배포 실패다.

- **플랫폼 → Web → 사이트 도메인**: `https://uiwanginside.kimserv.com` 추가
- **카카오 로그인 → Redirect URI**: `https://uiwanginside.kimserv.com/api/auth/callback/kakao` 추가

Vercel 을 대체하므로 기존 Vercel 도메인은 지워도 된다.

### 2. 공유기 포트 포워딩

`80`, `443` → 파이. Caddy 가 인증서를 받을 때 80 으로 확인이 오므로, 포워딩이
되기 전에 올리면 발급에 실패한다. 도메인 A 레코드도 공인 IP 를 가리켜야 한다.

### 3. 파이 준비

```bash
sudo apt update && sudo apt install -y docker.io docker-compose-v2
sudo usermod -aG docker "$USER"    # 다시 로그인해야 적용된다
mkdir -p ~/uiwanginside
```

### 4. 환경변수 옮기기

```bash
DOMAIN=uiwanginside.kimserv.com ./scripts/export-env.sh     # deploy/.env.pi 생성
scp deploy/.env.pi <파이>:~/uiwanginside/.env
```

값의 출처는 **`.env.local`** 이다. Vercel 은 참고만 한다.

`vercel env pull` 을 그대로 쓸 수 없다. Sensitive 로 표시된 변수를 실제 값이 아니라
`[SENSITIVE]` 로 내려주는데, 이 프로젝트에서는 13개가 그렇다 — 지도 키·카카오
로그인·모든 공공데이터 키가 거기에 든다. 그대로 올리면 화면은 뜨는데 아무 데이터도
안 나오고, 원인이 어디인지도 보이지 않는다. 스크립트가 자리표시자를 거부한다.

`AUTH_URL` 만 새 도메인으로 바꾼다. `VERCEL_*`·`NX_*`·`TURBO_*` 는 파이에서 의미가
없어 걸러낸다. 필수 값이 빠지면 파일을 쓰지 않고 멈춘다.

**비밀값이므로 저장소에 넣지 않는다** — `deploy/.env.pi` 는 `.gitignore` 에 있다.

### 5. DNS

`uiwanginside.kimserv.com` 으로 쓴다 — `deploy/Caddyfile` 에 이미 적혀 있다.
kimserv.com apex 와 www 는 Vercel 의 앱 마켓이 계속 쓰므로 건드리지 않는다.

Google Cloud DNS(`ns-cloud-b*.googledomains.com`)에 A 레코드를 하나 추가한다.

```
uiwanginside.kimserv.com.   A   <파이 공인 IP>      # 파이에서: curl -s ifconfig.me
```

공인 IP 가 유동이면 갱신 수단이 필요하다 — Google Cloud DNS 에는 자동 갱신이
없어서, 바뀔 때마다 인증서와 접속이 함께 끊긴다.

## 미리 확인한 것 (2026-08-22, 파이 없이 맥에서)

파이에 올리기 전에 맥에서 검증할 수 있는 것은 해 뒀다.

- `linux/arm64` 이미지 빌드 — 성공, 452MB
- 그 이미지를 띄워 파이에 올라갈 `.env` 그대로 실행 — 홈·`/status` 200,
  `/gallery`·`/lists` 는 307(로그인 필요, 정상), 날씨·미세먼지·의료·교통 API 200
- `_next/static` 의 CSS·JS 가 404 가 아닌지 — 정상 (standalone 이 빼먹는 부분)
- 지도 키가 클라이언트 번들에 박혔는지 — 박혀 있다
- Neon 쓰기 — `/api/visit` 204

남은 것은 파이·DNS·공유기·카카오 콘솔처럼 맥에서 확인할 수 없는 것뿐이다.

## 배포

```bash
PI=uiwang@192.168.0.50 ./scripts/deploy-pi.sh
```

빌드 → 전송 → 재시작까지 한 번에 한다. 이미지를 그대로 다시 쓰려면
`SKIP_BUILD=1` 을 붙인다.

## 확인

```bash
ssh <파이> 'cd ~/uiwanginside && docker compose ps'
ssh <파이> 'cd ~/uiwanginside && docker compose logs -f app'
```

브라우저에서 순서대로 본다.

1. `https://uiwanginside.kimserv.com` — 자물쇠가 잠기고 **지도가 그려지는지** (안 그려지면 1번 도메인 등록)
2. 상단 요약줄에 날씨·미세먼지·사고·진료 값이 들어오는지 (안 들어오면 `.env` 의 키)
3. 카카오 로그인 (실패하면 Redirect URI 또는 `AUTH_URL`)
4. `https://uiwanginside.kimserv.com/status` — 외부 API 6개의 키 상태를 한 화면에서 진단

## 되돌리기

이미지에 태그를 남겨 두면 바로 되돌릴 수 있다.

```bash
ssh <파이> 'docker tag uiwanginside:latest uiwanginside:prev'   # 배포 전에
ssh <파이> 'cd ~/uiwanginside && docker tag uiwanginside:prev uiwanginside:latest && docker compose up -d'
```

## 남는 것

Vercel 이 해 주던 것 중 파이에서는 스스로 챙겨야 하는 것들이다.

- **백업** — 데이터는 Neon(외부)과 Vercel Blob(외부)에 있어 파이가 죽어도 남는다.
  파이에 있는 것은 `.env` 와 Caddy 인증서뿐이다.
- **모니터링** — 죽었을 때 알려 줄 것이 없다. `restart: unless-stopped` 가 다시
  띄우지만, 계속 실패하면 조용하다.
- **SD 카드 수명** — 로그가 카드를 깎는다. compose 에서 컨테이너 로그를
  10MB×3 으로 묶어 뒀다. 가능하면 SSD 부팅을 권한다.
