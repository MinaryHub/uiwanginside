/**
 * 버스를 노선 경로 위로 움직인다.
 *
 * 위치는 16초에 한 번만 온다. 두 지점을 직선으로 이으면 코너와 곡선에서
 * 도로를 가로질러 간다. 노선의 실제 주행 경로에 두 지점을 붙이고 그
 * 사이를 경로를 따라 걷는다.
 *
 * 없는 위치를 만들지 않기 위한 안전장치가 셋 있다. 경로 붙이기가
 * 어긋나면 버스가 엉뚱한 길을 달리는데, 그건 직선보다 나쁘다.
 */

export type LatLng = [number, number];

/** 위도 37도 기준. 미터로 재야 위·경도 왜곡에 흔들리지 않는다. */
function mx(a: LatLng, b: LatLng): number {
  return Math.hypot((a[0] - b[0]) * 111_000, (a[1] - b[1]) * 88_000);
}

/** 점을 선분 위로 내린 발과 그 거리 */
function project(p: LatLng, a: LatLng, b: LatLng): { t: number; d: number } {
  const ax = (b[1] - a[1]) * 88_000;
  const ay = (b[0] - a[0]) * 111_000;
  const px = (p[1] - a[1]) * 88_000;
  const py = (p[0] - a[0]) * 111_000;
  const len2 = ax * ax + ay * ay;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, (px * ax + py * ay) / len2));
  const d = Math.hypot(px - ax * t, py - ay * t);
  return { t, d };
}

export interface Anchor {
  /** 선분 번호 */
  seg: number;
  /** 선분 안에서의 위치 (0~1) */
  t: number;
  /** 경로에서 떨어진 거리 (m) */
  off: number;
}

/** 경로에서 가장 가까운 자리를 찾는다 */
export function snap(path: LatLng[], p: LatLng): Anchor | null {
  if (path.length < 2) return null;
  let best: Anchor | null = null;
  for (let i = 0; i < path.length - 1; i++) {
    const { t, d } = project(p, path[i], path[i + 1]);
    if (!best || d < best.off) best = { seg: i, t, off: d };
  }
  return best;
}

function at(path: LatLng[], a: Anchor): LatLng {
  const p = path[a.seg];
  const q = path[a.seg + 1];
  return [p[0] + (q[0] - p[0]) * a.t, p[1] + (q[1] - p[1]) * a.t];
}

/** 두 자리 사이의 경로 길이 (m) */
function along(path: LatLng[], from: Anchor, to: Anchor): number {
  if (to.seg < from.seg || (to.seg === from.seg && to.t < from.t)) return -1;
  if (to.seg === from.seg) return mx(path[from.seg], path[from.seg + 1]) * (to.t - from.t);
  let sum = mx(at(path, from), path[from.seg + 1]);
  for (let i = from.seg + 1; i < to.seg; i++) sum += mx(path[i], path[i + 1]);
  return sum + mx(path[to.seg], at(path, to));
}

/**
 * 경로를 따라 걷는 구간. 만들 수 없으면 null 이고, 그때는 직선으로 잇는다.
 *
 * 막는 경우가 셋이다.
 *  - 관측 지점이 경로에서 멀다 (MAX_OFF). 다른 노선이나 잘못된 자료다.
 *  - 뒤로 간다. 회차하거나 자료가 뒤엉킨 것이라 이으면 거꾸로 달린다.
 *  - 경로로 잰 거리가 직선의 세 배를 넘는다. 엉뚱한 구간에 붙은 것이다.
 */
const MAX_OFF = 120;
const MAX_DETOUR = 3;

export interface PathRun {
  path: LatLng[];
  from: Anchor;
  to: Anchor;
  /** 경로 길이 (m) */
  length: number;
}

export function planRun(path: LatLng[], a: LatLng, b: LatLng): PathRun | null {
  const from = snap(path, a);
  const to = snap(path, b);
  if (!from || !to) return null;
  if (from.off > MAX_OFF || to.off > MAX_OFF) return null;

  const length = along(path, from, to);
  if (length < 0) return null;

  const direct = mx(a, b);
  if (direct > 1 && length > direct * MAX_DETOUR) return null;

  return { path, from, to, length };
}

/** 구간의 진행률(0~1) 에 해당하는 좌표 */
export function walk(run: PathRun, ratio: number): LatLng {
  const want = run.length * Math.max(0, Math.min(1, ratio));
  if (want <= 0) return at(run.path, run.from);

  let acc = 0;
  let cur = at(run.path, run.from);
  for (let i = run.from.seg + 1; i <= run.to.seg; i++) {
    const next = i === run.to.seg ? at(run.path, run.to) : run.path[i];
    const d = mx(cur, next);
    if (acc + d >= want) {
      const t = d === 0 ? 0 : (want - acc) / d;
      return [cur[0] + (next[0] - cur[0]) * t, cur[1] + (next[1] - cur[1]) * t];
    }
    acc += d;
    cur = next;
  }
  return at(run.path, run.to);
}
