import { UIWANG_BBOX } from "./uiwang-boundary";
import { isInsideUiwang } from "./geo";

/**
 * 소통정보를 지도에 그리기 위한 공통 규칙.
 *
 * ITS 소통정보에는 좌표가 없다. linkId·startNodeId·endNodeId 와 도로명뿐이고,
 * 노드 좌표를 주는 엔드포인트도 없다 (표준노드링크는 내려받는 SHP 파일이다).
 * 그래서 두 가지를 맞물려 쓴다.
 *
 *   - 어디가 막히는가 : 의왕을 격자로 나눠 칸마다 따로 조회한다.
 *                       ITS 는 좁은 범위를 정확히 지켜 주므로, 어느 칸에서
 *                       온 값인지가 곧 대략의 위치가 된다.
 *   - 어떤 선을 칠하는가 : 도로 형상은 OpenStreetMap 에서 가져온다.
 *                       의왕 주요도로 78개 중 60개가 ITS 도로명과 일치한다.
 *
 * 칸 하나가 3.4km 이므로 "이 도로의 이 언저리" 까지가 한계다. 링크 하나하나의
 * 위치는 알 수 없다. 도로 전체를 한 색으로 칠하지 않는 이유는, 같은 시내에서도
 * 경수대로가 6~74km/h 로 갈리기 때문이다.
 */

/*
 * 격자를 4×5 에서 3×4 로 줄였다.
 *
 * 칸마다 ITS 를 한 번씩 두드린다. 시 경계에 걸치는 칸이 15개에서 10개로
 * 줄고, 갱신 주기까지 90초에서 5분으로 늘려 호출이 시간당 440번에서
 * 132번으로 준다. ITS 가 Vercel 에서 통째로 막히는 일이
 * 반복되는데, 우리 호출량이 원인일 가능성이 커서 먼저 줄여 본다.
 *
 * 대신 칸이 2.6km 에서 3.4km 로 커진다 — 도로를 끊는 단위가 그만큼
 * 굵어진다. 실측했을 때 잡히는 도로 수는 거의 같았다 (293 → 316).
 */
export const TRAFFIC_GRID = { nx: 3, ny: 4 } as const;

const W = (UIWANG_BBOX.maxLng - UIWANG_BBOX.minLng) / TRAFFIC_GRID.nx;
const H = (UIWANG_BBOX.maxLat - UIWANG_BBOX.minLat) / TRAFFIC_GRID.ny;

/** 좌표가 속한 칸 번호. 서버와 클라이언트가 같은 답을 내야 한다. */
export function tileOf(lat: number, lng: number): number {
  const i = Math.min(
    TRAFFIC_GRID.nx - 1,
    Math.max(0, Math.floor((lng - UIWANG_BBOX.minLng) / W)),
  );
  const j = Math.min(
    TRAFFIC_GRID.ny - 1,
    Math.max(0, Math.floor((lat - UIWANG_BBOX.minLat) / H)),
  );
  return j * TRAFFIC_GRID.nx + i;
}

export interface TrafficTile {
  idx: number;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/**
 * 시 경계에 걸치는 칸만 돌려준다.
 * 열두 칸 중 둘은 통째로 이웃 도시라 부를 이유가 없다 (10칸만 조회).
 */
export function cityTiles(): TrafficTile[] {
  const out: TrafficTile[] = [];
  for (let i = 0; i < TRAFFIC_GRID.nx; i++) {
    for (let j = 0; j < TRAFFIC_GRID.ny; j++) {
      const minX = UIWANG_BBOX.minLng + i * W;
      const minY = UIWANG_BBOX.minLat + j * H;
      const maxX = minX + W;
      const maxY = minY + H;
      const probes: [number, number][] = [
        [minY, minX], [minY, maxX], [maxY, minX], [maxY, maxX],
        [(minY + maxY) / 2, (minX + maxX) / 2],
        [minY, (minX + maxX) / 2], [maxY, (minX + maxX) / 2],
        [(minY + maxY) / 2, minX], [(minY + maxY) / 2, maxX],
      ];
      if (!probes.some(([lat, lng]) => isInsideUiwang(lat, lng))) continue;
      out.push({ idx: j * TRAFFIC_GRID.nx + i, minX, minY, maxX, maxY });
    }
  }
  return out;
}

export type TrafficLevel = "smooth" | "slow" | "congested";

/**
 * 국가교통정보센터 소통상태 기준.
 * 도로 종류를 나누지 않으면 이면도로 15km/h 가 전부 '정체' 가 되어
 * 도로망의 3분의 2가 빨갛게 물든다. 실제로 그랬다 (243/386 → 134/386).
 */
export function roadLevel(speed: number, expressway: boolean): TrafficLevel {
  if (expressway) return speed >= 80 ? "smooth" : speed >= 40 ? "slow" : "congested";
  return speed >= 25 ? "smooth" : speed >= 15 ? "slow" : "congested";
}

export const LEVEL_COLOR: Record<TrafficLevel, string> = {
  smooth: "#17734f",
  slow: "#d97706",
  congested: "#dc2626",
};

export const LEVEL_LABEL: Record<TrafficLevel, string> = {
  smooth: "원활",
  slow: "서행",
  congested: "정체",
};

/**
 * 구간 속도의 평균은 산술평균이 아니다.
 * 짧고 빠른 구간과 길고 느린 구간을 같은 무게로 더하면 실제보다 빠르게 나온다.
 * 통행시간으로 가중해 공간평균속도를 낸다 — Σ(v·t) / Σt.
 */
export interface TrafficSegment {
  /** 도로명|칸 — 같은 조각을 다시 그리지 않기 위한 키 */
  key: string;
  road: string;
  speed: number;
  level: TrafficLevel;
  path: [number, number][];
}

/**
 * 도로 형상을 칸 경계에서 끊고, 조각마다 그 칸의 속도를 입힌다.
 *
 * 한 도로를 통째로 칠하지 않는 이유는 속도가 구간마다 다르기 때문이다.
 * 칸을 넘어가는 지점에서 끊으므로, 조각 하나는 "이 도로가 이 칸을
 * 지나는 부분" 이 된다.
 */
export function buildSegments(
  roads: { name: string; expressway: boolean; path: [number, number][] }[],
  speeds: { road: string; tile: number; speed: number }[],
): TrafficSegment[] {
  const byKey = new Map<string, number>();
  for (const s of speeds) byKey.set(`${s.road}|${s.tile}`, s.speed);

  const out: TrafficSegment[] = [];
  let n = 0;
  for (const road of roads) {
    let tile = -1;
    let run: [number, number][] = [];

    const flush = () => {
      if (run.length < 2) return;
      const speed = byKey.get(`${road.name}|${tile}`);
      if (speed === undefined) return;
      out.push({
        // 같은 도로가 여러 way 로 쪼개져 있어 일련번호를 붙인다
        key: `${road.name}|${tile}|${n++}`,
        road: road.name,
        speed,
        level: roadLevel(speed, road.expressway),
        path: run,
      });
    };

    for (const p of road.path) {
      const t = tileOf(p[0], p[1]);
      if (t !== tile) {
        // 끊긴 자리가 벌어지지 않게 경계점을 양쪽에 함께 넣는다
        if (run.length > 0) {
          run.push(p);
          flush();
        }
        tile = t;
        run = [p];
      } else {
        run.push(p);
      }
    }
    flush();
  }
  return out;
}

export function spaceMeanSpeed(samples: { speed: number; travelTime: number }[]): number {
  let dist = 0;
  let time = 0;
  for (const s of samples) {
    dist += s.speed * s.travelTime;
    time += s.travelTime;
  }
  return time > 0 ? dist / time : 0;
}
