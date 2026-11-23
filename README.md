# 의왕 인사이드 (Uiwang Inside)

의왕시 **공공데이터를 지도 한 장에** 모아 보여주는 서비스.
회원가입·로그인 없이 누구나 볼 수 있고, 시민이 글이나 사진·별점을 남기는 기능은 없다.
화면의 모든 숫자는 공공기관이 공개한 자료에서 온다.

| 분야 | 보여주는 것 | 출처 |
| --- | --- | --- |
| 🌤️ 날씨·환경 | 현재 날씨·시간대별 예보·기상특보·미세먼지·계절별 무더위/한파/지진 쉼터 | 기상청, 에어코리아, 재난안전데이터공유플랫폼, 행정안전부 |
| 🚌 교통 | 버스 도착·실시간 버스 위치·노선 경로선·도착 알림·전기차 충전소·사고/공사·도로 소통·고속도로 CCTV·주차장 | 경기도 GBIS, 경기데이터드림, 한국환경공단, ITS, 행정안전부 표준데이터 |
| 🏥 의료 | 근처 응급실 실시간 가용병상, 지금 진료 중인 병원·약국과 요일별 진료시간 | 국립중앙의료원 |
| 🏘️ 생활 | 공원·공중화장실·방범 CCTV·공공도서관·학교 정보와 급식·쓰레기 배출 안내 | 행정안전부 표준데이터, 경기데이터드림, 나이스, 의왕시청 |
| 📊 인구·비교 | 행정동별 인구·세대수, 6개 행정동 7종 인프라 비교(전체 / 1만명당) | 행정안전부 주민등록 인구통계 및 공공시설 집계 |
| 🏭 산업 | 동별·업종별 제조업 분포, 큰 일터 | 경기도 의왕시 공장 현황 |
| 📰 소식 | 의왕시 문화행사·모집·시정 공지 및 지역 뉴스 | 경기데이터드림, 네이버 검색 |

자료별 제공 기관·갱신 주기·화면 위치는 **`/opendata`** (공공데이터 안내) 에서 한눈에 본다.
목록은 `src/lib/datasets.ts` 한 곳에 있다 — 자료를 새로 붙이면 여기에도 한 줄 더한다.

실시간 자료는 자동으로 다시 받아온다 — 버스 위치 16초, 버스 도착 30초(도착 알림 대기 시 15초), 교통 60초,
전기차 충전소 3분, 뉴스·시정소식 5분, 날씨·미세먼지·의료 10분.

> 2026-11 개편: 사진 올리기·사진첩·장소 리스트와 공유·카카오 로그인·맛집 별점을
> 모두 없앴다. 예전 DB 표(`photos`·`place_ratings`·`place_lists`·`place_list_items`)는
> 지우지 않고 그대로 둔다 — 더 읽지도 쓰지도 않으며, 필요 없으면 직접 `DROP` 하면 된다.

---

## 빠른 시작

```bash
npm install
cp .env.example .env.local   # 키를 채워넣으세요 (아래 참고)
npm run dev                  # http://localhost:3000
```

> **키가 하나도 없어도 앱은 실행됩니다.** 샘플이나 가짜 데이터는 표시하지 않으며,
> 키가 없는 영역은 연동 안내가 뜹니다. 키를 넣는 즉시 실시간 데이터로 채워집니다.
> 지도는 **카카오맵**이 기본입니다. 카카오 JS 키가 없거나 카카오맵을 못 불러오면
> **OpenStreetMap 지도로 자동 대체**되어 지도 자리가 비지 않습니다.

### 장소 데이터는 키 없이도 실제 데이터입니다

`KAKAO_REST_KEY` 가 없으면 **OpenStreetMap Overpass API** 와 지자체 공개 시설 데이터로 자동 폴백합니다 —
무인증이지만 샘플이 아닌 의왕시 실제 시설 데이터입니다.
카카오 키를 넣으면 전화번호·상세페이지까지 제공하는 카카오 로컬이 우선 사용됩니다.
좌측 패널 우상단 출처 표시(`카카오` / `OSM` / `공공`)로 현재 출처를 확인할 수 있습니다.

데이터 © OpenStreetMap contributors (ODbL).

### 연동 상태 진단

**`/status`** 에서 19개 외부 API와 DB 연동 상태를 한 번에 점검합니다.
키를 추가하거나 활용신청이 승인된 뒤 이 페이지만 새로고침하면 반영 여부를 바로 알 수 있습니다.
(오류 코드와 조치 방법까지 함께 표시됩니다. 키 변경 후에는 개발 서버 재시작 필요.)

## API 키 발급

전체 환경변수 목록은 `.env.example` 에 정리되어 있습니다.

| 환경변수 | 발급처 | 용도 |
| --- | --- | --- |
| `NEXT_PUBLIC_KAKAO_JS_KEY` | [developers.kakao.com](https://developers.kakao.com) → 앱 키 → **JavaScript 키** | 지도 (없으면 OpenStreetMap 으로 대체) |
| `NEXT_PUBLIC_MAP_TILES` | (선택) 타일 URL — 기본은 OpenStreetMap | 대체 지도 그림 바꾸기 |
| `KAKAO_REST_KEY` | 같은 앱의 **REST API 키** | 카테고리별 장소 검색 · 공장 주소 지오코딩 |
| `KMA_SERVICE_KEY` | [data.go.kr](https://www.data.go.kr) → *기상청\_단기예보 조회서비스* · *기상특보 조회서비스* | 날씨 · 기상특보 (다른 data.go.kr 키의 기본 폴백) |
| `AIRKOREA_SERVICE_KEY` | data.go.kr → *한국환경공단\_에어코리아\_대기오염정보* | 미세먼지·초미세먼지·예보 (비우면 `KMA_SERVICE_KEY` 재사용) |
| `EMERGENCY_SERVICE_KEY` | data.go.kr → *국립중앙의료원\_응급의료·병의원·약국 정보* | 응급실 병상 · 진료중인 병원·약국 (비우면 `KMA_SERVICE_KEY` 재사용) |
| `FACTORY_SERVICE_KEY` | data.go.kr → *경기도 의왕시\_공장 현황* (`15126591`, ODCloud) | 제조업 분포 · 공장 마커 (비우면 `KMA_SERVICE_KEY` 재사용) |
| `EV_CHARGER_SERVICE_KEY` | data.go.kr → *한국환경공단\_전기자동차 충전소 정보* | 전기차 충전소 실시간 현황 (비우면 `KMA_SERVICE_KEY` 재사용) |
| `SHELTER_SERVICE_KEY` | data.go.kr → *행정안전부\_무더위쉼터 정보* | 무더위쉼터 폴백 (비우면 `KMA_SERVICE_KEY` 재사용) |
| `LIBRARY_SERVICE_KEY` | data.go.kr → *전국도서관표준데이터* (`15136382`, ODCloud) | 공공도서관 폴백 (비우면 `KMA_SERVICE_KEY` 재사용) |
| `GBIS_SERVICE_KEY` | data.go.kr → *경기도\_버스도착정보* · *버스위치정보* · *노선정보* | 버스 도착 · 실시간 위치 · 노선 경로 |
| `TAGO_SERVICE_KEY` | data.go.kr → *국토교통부\_TAGO 버스위치정보* | 수도권 광역버스 위치 보조 (비우면 `GBIS_SERVICE_KEY` 재사용) |
| `GG_DATA_KEY` | [data.gg.go.kr](https://data.gg.go.kr) → *버스정류소 · 공공도서관 · 문화행사 · 지역화폐* | 의왕 정류소 · 도서관 · 문화행사 · 의왕사랑상품권 가맹점 |
| `SEOUL_SUBWAY_KEY` | [data.seoul.go.kr](https://data.seoul.go.kr) → *실시간 지하철 도착정보* | 의왕역 1호선 실시간 열차 도착 (비우면 샘플 키 5건 조회) |
| `SAFETY_DATA_KEY` | [safetydata.go.kr](https://www.safetydata.go.kr) → *DSSP-IF-10941* | 한파·무더위·지진 대피소 및 쉼터 |
| `ITS_API_KEY` | [openapi.its.go.kr](https://openapi.its.go.kr) 회원가입 → 인증키 | 사고 · 정체 · 고속도로 CCTV |
| `NEIS_API_KEY` | [open.neis.go.kr](https://open.neis.go.kr) | 학교 기본정보 · 학급 수 · 급식 |
| `NAVER_CLIENT_ID` / `NAVER_CLIENT_SECRET` | [developers.naver.com](https://developers.naver.com) → **검색 API** | 의왕 지역 뉴스 · 시정/모집 소식 |
| `DATABASE_URL` | [neon.tech](https://neon.tech) Postgres | 교통·CCTV·공장 좌표 캐시 및 접속 통계 |
| `STATS_TOKEN` | 임의 긴 문자열 (선택) | 비공개 접속 통계(`/stats/<토큰>`) 활성화 |

**지도:** 카카오맵이 기본입니다. 카카오 개발자 콘솔 → *앱 설정 → 플랫폼 → Web* 에
배포 도메인(예: `https://uiwanginside.vercel.app`, 로컬은 `http://localhost:3000`)을
등록해야 그려집니다. 키가 없거나, 도메인이 등록되지 않았거나, 10초 안에 응답이 없으면
Leaflet + OpenStreetMap 지도로 자동 대체하고 지도 오른쪽 아래에 "카카오맵 대신 OpenStreetMap" 이 작게 뜹니다.
대체 지도의 `© OpenStreetMap contributors` 표시는 이용 조건이라 가리지 않습니다.

## 구조

```
src/
├─ app/
│  ├─ page.tsx                 지도 대시보드 진입점
│  ├─ robots.ts / sitemap.ts   검색엔진 크롤링 · 사이트맵
│  ├─ opendata/                공공데이터 안내 (출처·갱신 주기)
│  ├─ status/                  19개 외부 API·DB 연동 상태 진단
│  ├─ stats/[token]/           접속 통계 (비밀 주소)
│  ├─ layout.tsx / globals.css 테마 · SEO(OG/JSON-LD) · PWA 메타
│  └─ api/
│     ├─ places/         카카오 로컬 / OSM / 공공시설(공원·주차장·화장실·CCTV·공장)
│     ├─ factories/      경기도 의왕시 공장 현황 (ODCloud 15126591 + 좌표 캐시)
│     ├─ weather/        기상청 초단기실황 + 단기예보 + 기상특보
│     ├─ air/            에어코리아 측정소(고천동·청계동) + 경기남부 예보
│     ├─ shelters/       한파·무더위·지진 쉼터 (SafetyData / 행안부)
│     ├─ medical/        국립중앙의료원 병·의원·약국 요일별 진료시간
│     ├─ emergency/      응급실 실시간 가용병상
│     ├─ subway/         의왕역 1호선 실시간 열차 도착 (서울 열린데이터광장)
│     ├─ traffic/        ITS 돌발정보 + 구간 소통속도
│     ├─ cctv/           고속도로 CCTV 목록 및 이미지 중계
│     ├─ ev-chargers/    한국환경공단 의왕시 전기차 충전소 실시간 현황
│     ├─ transit/        주변 버스정류소 + 실시간 도착정보
│     ├─ bus-positions/  실시간 운행 버스 위치 (GBIS + TAGO)
│     ├─ bus-route/      노선 주행 경로 (버스 이동 + 추적 경로선)
│     ├─ local-currency/ 의왕사랑상품권 가맹점 현황 (경기데이터드림)
│     ├─ libraries/      의왕시 공공도서관 현황 (경기데이터드림 / ODCloud)
│     ├─ school/         나이스 학교 정보·학급·급식
│     ├─ notices/        의왕시 문화행사·시정·모집 소식 (경기데이터드림 + 네이버)
│     ├─ news/           네이버 지역 뉴스
│     └─ health/         연동 상태 진단 API (19종)
```

모든 외부 API는 **서버 라우트에서만** 호출합니다. 브라우저가 직접 부르는 것은 지도(카카오맵 SDK 또는 OSM 타일)뿐입니다.

### 공장 자료 (ODCloud 공공 API + 선택적 정적 스냅샷)

**`GET /api/factories`** 가 공공데이터포털 **경기도 의왕시\_공장 현황**(`15126591`) ODCloud API 에서
실시간으로 데이터를 받아오고, `KAKAO_REST_KEY` 와 `DATABASE_URL` 이 있으면 건물 단위로 좌표를
변환해 Neon DB(`factory_coords`)에 영구 캐시합니다.

필요하면 아래 명령으로 정적 스냅샷(`src/lib/uiwang-factories.ts`)을 미리 굳혀 둘 수도 있습니다.

```bash
# 공공 API 에서 직접 수집 + 지오코딩
npm run factories:fetch

# 또는 공공데이터포털 CSV 파일에서 변환
npm run factories:fetch -- ~/Downloads/경기도_의왕시_공장현황.csv
```

## 사용법

메뉴는 **하단 한 줄**이 전부입니다. 누르면 바로 내용이 열리고, 그 안에 또 고를 메뉴가 없습니다.

| 메뉴 | 열리는 것 |
| --- | --- |
| ☀️ 날씨 | 지금 날씨 · 기상특보 · 시간대별 예보 · 미세먼지 · 계절별 무더위/한파/지진 쉼터 |
| 🏥 병원·약국 | 근처 응급실 남은 병상 · 지금 문 연 병원·약국(요일별 진료시간 포함) |
| 🚌 버스·교통 | 1호선 의왕역 실시간 도착 · 정류소 즐겨찾기(⭐)·도착 알림(🔔)·노선 경로선 · 전기차 충전소 · CCTV |
| 🍜 맛집 | 음식점 · 카페 · 의왕사랑상품권 가맹점 |
| 🛒 생활 | 마트 · 편의점 · 은행 · 학교(급식·학급) · 의왕사랑상품권 가맹점 · 공공도서관 · 공원 · 화장실 |
| ♻️ 쓰레기 | 버리는 시간과 방법 |
| 🏘️ 우리 동네 | 우리 동네 지정(🏠) · 동별 인구 · 6개 동 인프라 비교(전체 / 1만명당) · 제조업 분포 |
| 📰 소식 | 의왕시 행사·시정·모집 소식 · 공식 누리집 바로가기 · 지역 뉴스 |

- 같은 메뉴를 다시 누르면 닫히고 지도만 남습니다. ✕ 로 닫았다면 "다시 보기" 단추로 펼칩니다.
- 상단 요약줄(기상특보·뉴스·기온·미세먼지·사고·진료)을 누르면 해당 메뉴가 열립니다.
- 오른쪽 단추는 내 위치 · 확대 · 축소, 상단 🔍 은 이름으로 찾기입니다.
- 휴대폰에서는 메뉴가 4칸 두 줄로 여덟 개 모두 한눈에 보입니다.

## 배포 (Vercel)

`vercel.json` 이 서울 리전(`icn1`)으로 설정되어 있으며, 무거운 API 라우트에는 `maxDuration` 과
`next/server` 의 `after()` 백그라운드 저장이 적용되어 있습니다.

```bash
npx vercel            # 프리뷰
npx vercel --prod     # 프로덕션
```

배포 전 Vercel 프로젝트 Environment Variables 에 `.env.example` 의 필요한 변수를 등록하고,
카카오 콘솔 Web 플랫폼에 배포 도메인을 추가하세요.
