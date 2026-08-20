import type { BusPositionsPayload } from "./types";

/**
 * 지도에 실시간 위치를 띄울 버스 노선을 고른다.
 *
 * 예전에는 화면이 볼 때마다 "근처 정류소에 가장 빨리 오는 여섯 개" 를 다시
 * 뽑았다. 조회 중심은 지도를 따라 움직이므로, 한 번 끌면 근처 정류소가
 * 바뀌고 여섯 중 넷이 통째로 갈렸다. 실측이다 — 시청에서 660m 를 옮기니
 * 05-1·502·1-5·15-2 가 빠지고 777·8·900·300 이 들어왔다. 화면에 있던 버스
 * 세 대가 한꺼번에 사라졌다가 다른 버스가 나타났다.
 *
 * 그래서 한 번 올린 노선은 그대로 둔다. 자리를 내주는 것은 의왕 안에 한
 * 대도 없다고 확인된 노선뿐이다 — 그 노선은 아무것도 그리지 않으니 내보내도
 * 사라지는 버스가 없다.
 *
 * 근처가 아닌 노선이 남는 것은 틀린 것이 아니다. 서버가 의왕 경계 안의
 * 차량만 주므로, 화면에 남는 버스는 모두 실제로 의왕을 달린다.
 */

/** 한 번에 띄우는 노선 수 — 노선마다 상류를 두드린다 */
export const FLEET_MAX = 6;
/** 의왕 안에 한 대도 없던 노선에 다시 자리를 주기까지 */
export const EMPTY_RETRY_MS = 10 * 60_000;

export interface FleetRoute {
  id: string;
  name: string;
}

export interface Fleet {
  routes: FleetRoute[];
  /** 노선id → 의왕 안이 비어 있던 시각 */
  emptyAt: Record<string, number>;
}

const NO_ROUTES: FleetRoute[] = [];
export const EMPTY_FLEET: Fleet = { routes: NO_ROUTES, emptyAt: {} };

export function pickFleet(
  cur: Fleet,
  /** "노선id:이름" 을 도착이 이른 순으로 이어 붙인 것 */
  candidates: string,
  /** 방금 받은 응답. 아직 없으면 null */
  answered: BusPositionsPayload[] | null,
  now = Date.now(),
): Fleet {
  if (!candidates) {
    return cur.routes.length ? { routes: NO_ROUTES, emptyAt: cur.emptyAt } : cur;
  }

  let kept = cur.routes;
  const emptyAt = { ...cur.emptyAt };
  if (answered) {
    /*
     * 응답에 있으면서 비어 있는 노선만 내보낸다. 응답에 아예 없으면 방금
     * 넣어 아직 못 받은 것이므로 판단하지 않는다 — 여기서 성급하게 빼면
     * 노선이 들어왔다 나갔다 한다.
     */
    const count = new Map(answered.map((r) => [r.routeId, r.positions.length]));
    for (const r of kept) if (count.get(r.id) === 0) emptyAt[r.id] = now;
    kept = kept.filter((r) => count.get(r.id) !== 0);
  }

  const rested = now - EMPTY_RETRY_MS;
  const next = [...kept];
  for (const item of candidates.split(",")) {
    if (next.length >= FLEET_MAX) break;
    const i = item.indexOf(":");
    const id = item.slice(0, i);
    if (next.some((r) => r.id === id)) continue;
    // 방금 비어 있던 노선은 잠시 쉬게 둔다. 안 그러면 막차가 끊긴 시간에
    // 빈 노선만 16초마다 갈아끼우게 된다
    if ((emptyAt[id] ?? 0) > rested) continue;
    next.push({ id, name: item.slice(i + 1) });
  }

  // 바뀌지 않았으면 받은 배열을 그대로 돌려준다 — 조회 주소가 흔들리지
  // 않게 하려면 같음이 곧 같은 값이어야 한다
  const same =
    next.length === cur.routes.length && next.every((r, i) => r.id === cur.routes[i].id);
  return { routes: same ? cur.routes : next, emptyAt };
}
