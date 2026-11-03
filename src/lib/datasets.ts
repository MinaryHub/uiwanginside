import type { ModeId } from "./modes";

/**
 * 이 서비스가 보여주는 공공데이터 목록.
 *
 * 화면 곳곳에 흩어져 있는 자료가 어디서 왔고 얼마나 자주 바뀌는지를 한 곳에
 * 모은다. 시민은 숫자를 믿어도 되는지 알 수 있고, 운영자는 어느 키가 무엇을
 * 살리는지 한눈에 본다. 자료를 새로 붙이면 여기에도 한 줄 더한다.
 */
export interface Dataset {
  id: string;
  name: string;
  /** 제공 기관 */
  provider: string;
  /** 원본을 찾아볼 수 있는 곳 */
  link: string;
  /** 얼마나 자주 새로 받는가 */
  refresh: string;
  /** 이 서비스에서 무엇을 보여주는가 */
  shows: string;
  /** 지도에서 바로 볼 수 있는 모드. 없으면 상단 요약줄에서 연다 */
  mode?: ModeId;
  /** 실시간(주기적 조회) 인가, 저장소에 굳혀 둔 스냅샷인가 */
  kind: "live" | "snapshot";
}

export interface DatasetGroup {
  title: string;
  emoji: string;
  items: Dataset[];
}

/**
 * 공공데이터포털은 자료 번호가 개편 때마다 바뀐다. 번호를 박아 두면 언젠가
 * 엉뚱한 자료로 이어지므로, 이름으로 검색한 결과를 연다.
 */
function dataGoKr(keyword: string): string {
  return `https://www.data.go.kr/tcs/dss/selectDataSetList.do?keyword=${encodeURIComponent(keyword)}`;
}

export const DATASET_GROUPS: DatasetGroup[] = [
  {
    title: "날씨 · 환경",
    emoji: "🌤️",
    items: [
      {
        id: "kma-forecast",
        name: "단기예보 · 초단기실황",
        provider: "기상청",
        link: dataGoKr("기상청_단기예보 조회서비스"),
        refresh: "10분",
        shows: "현재 기온·습도·바람·강수와 시간대별 예보",
        kind: "live",
      },
      {
        id: "kma-alerts",
        name: "기상특보",
        provider: "기상청",
        link: dataGoKr("기상청_기상특보 조회서비스"),
        refresh: "10분",
        shows: "의왕시에 발효 중인 특보",
        kind: "live",
      },
      {
        id: "airkorea",
        name: "대기오염정보 (측정소별 실시간)",
        provider: "한국환경공단 에어코리아",
        link: dataGoKr("한국환경공단_에어코리아_대기오염정보"),
        refresh: "10분",
        shows: "미세먼지·초미세먼지 농도와 등급",
        kind: "live",
      },
    ],
  },
  {
    title: "교통",
    emoji: "🚌",
    items: [
      {
        id: "gbis-arrival",
        name: "경기도 버스도착정보",
        provider: "경기도",
        link: dataGoKr("경기도_버스도착정보 조회"),
        refresh: "30초",
        shows: "정류소별 버스 도착 예정 시간",
        mode: "transit",
        kind: "live",
      },
      {
        id: "gbis-location",
        name: "경기도 버스위치정보",
        provider: "경기도",
        link: dataGoKr("경기도_버스위치정보 조회"),
        refresh: "16초",
        shows: "지도 위 운행 중인 버스 위치",
        mode: "transit",
        kind: "live",
      },
      {
        id: "gg-stations",
        name: "버스정류소 현황",
        provider: "경기데이터드림",
        link: "https://data.gg.go.kr",
        refresh: "하루",
        shows: "의왕시 정류소 위치와 번호",
        mode: "transit",
        kind: "live",
      },
      {
        id: "its-events",
        name: "돌발상황 · 소통정보",
        provider: "국토교통부 국가교통정보센터(ITS)",
        link: "https://www.its.go.kr/opendata/",
        refresh: "1분",
        shows: "사고·공사·통제와 도로 구간별 속도",
        mode: "transit",
        kind: "live",
      },
      {
        id: "its-cctv",
        name: "도로 CCTV 영상",
        provider: "국토교통부 국가교통정보센터(ITS)",
        link: "https://www.its.go.kr/opendata/",
        refresh: "영상 요청 시",
        shows: "의왕시 구간 고속도로 CCTV 15대",
        mode: "transit",
        kind: "live",
      },
      {
        id: "std-parking",
        name: "전국주차장정보표준데이터",
        provider: "행정안전부",
        link: dataGoKr("전국주차장정보표준데이터"),
        refresh: "스냅샷",
        shows: "공영·민영 주차장 요금과 운영시간",
        mode: "transit",
        kind: "snapshot",
      },
    ],
  },
  {
    title: "의료",
    emoji: "🏥",
    items: [
      {
        id: "nmc",
        name: "병·의원 · 약국 찾기 서비스",
        provider: "국립중앙의료원",
        link: dataGoKr("국립중앙의료원_전국 병·의원 찾기 서비스"),
        refresh: "10분",
        shows: "지금 진료 중인 병원·약국과 요일별 진료시간",
        mode: "medical",
        kind: "live",
      },
    ],
  },
  {
    title: "생활 · 시설",
    emoji: "🏘️",
    items: [
      {
        id: "std-parks",
        name: "전국도시공원정보표준데이터",
        provider: "행정안전부",
        link: dataGoKr("전국도시공원정보표준데이터"),
        refresh: "스냅샷",
        shows: "의왕시 도시공원 63곳",
        mode: "life",
        kind: "snapshot",
      },
      {
        id: "std-toilets",
        name: "전국공중화장실표준데이터",
        provider: "행정안전부",
        link: dataGoKr("전국공중화장실표준데이터"),
        refresh: "스냅샷",
        shows: "공중화장실 126곳",
        mode: "life",
        kind: "snapshot",
      },
      {
        id: "std-cctv",
        name: "전국CCTV표준데이터",
        provider: "행정안전부",
        link: dataGoKr("전국CCTV표준데이터"),
        refresh: "스냅샷",
        shows: "방범·단속 CCTV 위치",
        mode: "life",
        kind: "snapshot",
      },
      {
        id: "neis",
        name: "학교기본정보 · 급식식단정보",
        provider: "교육부 나이스(NEIS)",
        link: "https://open.neis.go.kr",
        refresh: "장소를 열 때",
        shows: "학교 학급 수·학생 수와 오늘 급식",
        mode: "life",
        kind: "live",
      },
      {
        id: "waste",
        name: "생활쓰레기 배출 안내",
        provider: "의왕시청",
        link: "https://www.uiwang.go.kr/UWKORENV0301",
        refresh: "스냅샷",
        shows: "종류별 배출 방법과 시간",
        kind: "snapshot",
      },
    ],
  },
  {
    title: "인구 · 행정",
    emoji: "📊",
    items: [
      {
        id: "population",
        name: "주민등록 인구통계",
        provider: "행정안전부",
        link: "https://jumin.mois.go.kr",
        refresh: "월 1회 (스냅샷)",
        shows: "행정동별 인구·세대수",
        kind: "snapshot",
      },
    ],
  },
];

/**
 * 공공데이터는 아니지만 함께 쓰는 자료.
 * 섞어 적으면 어느 것이 공식 자료인지 흐려지므로 따로 둔다.
 */
export const OTHER_SOURCES: { name: string; use: string }[] = [
  { name: "카카오맵 · 카카오 로컬", use: "지도 화면과 음식점·마트 등 장소 검색" },
  { name: "OpenStreetMap (ODbL)", use: "카카오 키가 없을 때의 장소, 도로 형상, 일부 영업시간" },
  { name: "네이버 뉴스 검색", use: "의왕 관련 최신 뉴스 제목" },
];
