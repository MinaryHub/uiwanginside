export interface Bucket {
  /** 표시용 라벨 (시각 또는 날짜) */
  label: string;
  /** 조회 수 */
  views: number;
  /** 순 방문자 */
  visitors: number;
}

export interface NamedCount {
  name: string;
  count: number;
  /** 순 방문자 — 조회 수만 보면 새로고침이 많은 화면이 커 보인다 */
  visitors: number;
}

export interface StatsSummary {
  views: number;
  visitors: number;
  sessions: number;
  /** 로그인한 채로 본 조회 수 */
  memberViews: number;
}

export interface StatsPayload {
  /** 지금 이 순간 (최근 5분) 보고 있는 사람 */
  now: number;
  today: StatsSummary;
  yesterday: StatsSummary;
  last7: StatsSummary;
  last30: StatsSummary;
  /** 최근 24시간, 시각별 */
  hourly: Bucket[];
  /** 최근 30일, 날짜별 */
  daily: Bucket[];
  modes: NamedCount[];
  paths: NamedCount[];
  referrers: NamedCount[];
  devices: NamedCount[];
  /** 쌓인 콘텐츠 — 사람이 남긴 것들 */
  content: {
    members: number;
    photos: number;
    ratings: number;
    lists: number;
    sharedLists: number;
  };
  /** 기록이 시작된 시각 */
  since: string | null;
  updatedAt: string;
}
