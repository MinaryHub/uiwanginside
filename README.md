# 의왕 인사이드 (Uiwang Inside)

의왕시 **지도 중심** 생활·실시간 정보 포털.

- 🗺️ **지도**에서 학교 · 병원 · 약국 · 마트 · 편의점 · 은행 · 주차장 · 주유소 · 지하철역 · 공공기관 · 문화시설을 반경별로 탐색
- 🌤️ **날씨** — 현재 기온/습도/바람/강수 + 시간대별 예보 8칸 (기상청, 지난 시간대는 자동 제외)
- 🚨 **사고 · 교통정체** — 돌발상황(사고/공사/통제)과 구간 속도 (ITS 국가교통정보센터)
- 🚌 **대중교통** — 지도 중심 주변 정류소별 버스 도착 예정 (경기버스정보)
- 📰 **주요 뉴스** — 의왕 관련 실시간 뉴스 (네이버 검색)

모든 실시간 데이터는 자동 폴링됩니다 — 교통 60초, 버스 30초, 뉴스 5분, 날씨 10분.

---

## 빠른 시작

```bash
npm install
cp .env.example .env.local   # 키를 채워넣으세요 (아래 참고)
npm run dev                  # http://localhost:3000
```

> **키가 하나도 없어도 앱은 실행됩니다.** 키가 없는 영역은 샘플 데이터로 표시되고
> 각 카드에 `SAMPLE` 뱃지와 안내 문구가 붙습니다. 키를 넣는 즉시 `LIVE` 로 바뀝니다.
> (지도 렌더링만은 카카오 JS 키가 반드시 필요합니다.)

### 장소 데이터는 키 없이도 실제 데이터입니다

`KAKAO_REST_KEY` 가 없으면 **OpenStreetMap Overpass API** 로 자동 폴백합니다 — 무인증이지만
샘플이 아닌 의왕시 실제 시설 데이터입니다 (시청 반경 4km 기준 340여 곳).
카카오 키를 넣으면 전화번호·상세페이지까지 제공하는 카카오 로컬이 우선 사용됩니다.
좌측 패널 우상단 뱃지로 현재 출처(`카카오 LIVE` / `OSM` / `SAMPLE`)를 확인할 수 있습니다.

데이터 © OpenStreetMap contributors (ODbL).

### 연동 상태 진단

**`/status`** 에서 6개 API 를 실제로 호출해 키 상태를 진단합니다.
키를 추가하거나 활용신청이 승인된 뒤 이 페이지만 새로고침하면 반영 여부를 바로 알 수 있습니다.
(오류 코드와 조치 방법까지 함께 표시됩니다. 키 변경 후에는 개발 서버 재시작 필요.)

## API 키 발급

| 환경변수 | 발급처 | 용도 |
| --- | --- | --- |
| `NEXT_PUBLIC_KAKAO_JS_KEY` | [developers.kakao.com](https://developers.kakao.com) → 앱 키 → **JavaScript 키** | 지도 렌더링 |
| `KAKAO_REST_KEY` | 같은 앱의 **REST API 키** | 카테고리별 장소 검색 (로컬 API) |
| `KMA_SERVICE_KEY` | [data.go.kr](https://www.data.go.kr) → *기상청\_단기예보 조회서비스* → 일반 인증키 **(Decoding)** | 날씨 |
| `NAVER_CLIENT_ID` / `NAVER_CLIENT_SECRET` | [developers.naver.com](https://developers.naver.com) → 애플리케이션 등록 → **검색 API** | 뉴스 |
| `ITS_API_KEY` | [openapi.its.go.kr](https://openapi.its.go.kr) 회원가입 → 인증키 | 사고 · 정체 |
| `GBIS_SERVICE_KEY` | data.go.kr → *경기도\_버스도착정보 조회* **및** *경기도\_버스정류소 조회* → 일반 인증키 **(Encoding)** | 버스 도착 |

**경기버스는 서비스 2개를 모두 활용신청해야 합니다.** 앱은 *정류소 조회* 로 지도 중심
주변의 `stationId` 를 얻은 뒤 그 ID 로 *도착정보 조회* 를 호출합니다. 도착정보만 승인되면
정류소를 찾을 수 없어 도착 시간이 뜨지 않습니다. 이 경우 정류소 위치는 OpenStreetMap
데이터로 대체 표시되고, 패널에 `OSM 위치만` 뱃지가 붙습니다.

**카카오 JS 키 주의:** 카카오 개발자 콘솔 → *앱 설정 → 플랫폼 → Web* 에
`http://localhost:3000` (배포 시 실제 도메인도) 을 등록해야 지도가 뜹니다.

## 구조

```
src/
├─ app/
│  ├─ page.tsx                 대시보드 진입점
│  ├─ layout.tsx / globals.css 테마 (라이트·다크 자동)
│  └─ api/
│     ├─ places/    카카오 로컬 카테고리 검색 프록시 (최대 45건/카테고리)
│     ├─ weather/   기상청 초단기실황 + 단기예보 (발표시각 자동 계산)
│     ├─ traffic/   ITS 돌발정보 + 소통정보 (의왕시 bbox)
│     ├─ transit/   GBIS 주변 정류소 → 정류소별 도착정보 병렬 조회 (XML)
│     └─ news/      네이버 뉴스 검색
├─ components/
│  ├─ Dashboard.tsx            상태·SWR 폴링 오케스트레이션
│  ├─ KakaoMap.tsx             SDK 로드 + CustomOverlay 마커 동기화
│  ├─ ui.tsx                   Card / Badge / Skeleton / LiveDot
│  └─ panels/                  Places · Weather · Traffic · Transit · News
└─ lib/
   ├─ uiwang.ts   의왕시 좌표·격자·행정동·랜드마크·카테고리 정의
   ├─ types.ts    API 응답 타입
   └─ fetcher.ts  타임아웃 fetch + ApiEnvelope 헬퍼
```

모든 외부 API는 **서버 라우트에서만** 호출합니다 (`NEXT_PUBLIC_KAKAO_JS_KEY` 제외).
키가 브라우저로 노출되지 않고, 실패 시 8초 타임아웃 후 샘플로 폴백합니다.

## 사용법

- **좌측 패널** — 카테고리 칩으로 표시할 시설 선택, 반경 슬라이더(0.5~10km), 목록 내 검색
- **지도** — 드래그하면 그 위치 기준으로 장소·정류소가 다시 조회됨. 좌상단 레이어 토글로 사고/속도/정류소 마커 on·off
- **헤더** — 행정동(고천·부곡·오전·내손1·내손2·청계)과 랜드마크(왕송호수·철도박물관·백운호수·모락산) 바로가기
- **우측 패널** — 날씨/교통/버스/뉴스. 사고·정류소 항목을 누르면 지도가 해당 위치로 이동
- **모바일** — 하단 탭바로 목록 / 지도 / 실시간 전환

## 배포

```bash
npx vercel            # 프리뷰
npx vercel --prod     # 프로덕션
```

배포 전 Vercel 프로젝트에 위 환경변수를 모두 등록하고,
카카오 콘솔 Web 플랫폼에 배포 도메인을 추가하세요.
