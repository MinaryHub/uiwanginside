import { ok, fail, nowISO } from "@/lib/fetcher";
import { fetchGbisPositions } from "@/lib/gbisLocation";
import { fetchBusPositions } from "@/lib/tago";
import { isInsideUiwang } from "@/lib/geo";
import type { BusPositionsPayload } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * 상류 갱신 주기에 맞춘다.
 * 경기버스 위치 API 를 2.5초마다 두드려 재보니 값이 바뀌는 간격이
 * 15.7 · 15.9 · 15.7 초였다. 15초로 두면 두 번에 한 번은 같은 값을
 * 다시 받고, 10초로 줄이면 헛조회가 37% 가 된다.
 */
const CACHE_SEC = 16;

const EMPTY: BusPositionsPayload = {
  routeId: "",
  routeName: "",
  positions: [],
  cityName: "",
  source: "gbis",
  unresolved: 0,
  updatedAt: "",
};

/**
 * 여러 노선을 한 번에.
 *
 * 노선 하나를 골라야만 버스가 보이던 것을, 근처에 곧 오는 노선들을
 * 함께 띄우기 위해 열었다. 요청마다 노선 수만큼 상류를 두드리므로
 * 위에서 개수를 제한해 보낸다.
 *
 * routes=아이디:이름,아이디:이름 …
 */
const MAX_ROUTES = 8;

export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const many = sp.get("routes");
  if (many) return manyRoutes(many);

  const routeId = (sp.get("routeId") ?? "").replace(/[^0-9]/g, "").slice(0, 20);
  const routeName = (sp.get("routeName") ?? "").slice(0, 40);

  if (!routeId) return fail(EMPTY, "노선 정보가 없습니다.");

  const dataKey = process.env.GBIS_SERVICE_KEY;
  const ggKey = process.env.GG_DATA_KEY;
  const base = { ...EMPTY, routeId, routeName };

  if (!dataKey) return fail(base, "버스 인증키가 설정되지 않았습니다.");

  /**
   * GBIS 를 먼저 쓴다. 혼잡도·저상·좌석을 함께 주고, TAGO 에 없는
   * 서울 소속 노선(441번 등)까지 다룬다.
   * 좌표를 하나도 못 구하면 GPS 를 직접 주는 TAGO 로 넘어간다.
   */
  if (ggKey) {
    try {
      const r = await fetchGbisPositions(dataKey, ggKey, routeId);
      if (r.positions.length > 0) {
        return ok(
          {
            routeId,
            routeName,
            positions: r.positions,
            cityName: "",
            source: "gbis" as const,
            unresolved: r.unresolved,
            updatedAt: nowISO(),
          } satisfies BusPositionsPayload,
          r.unresolved > 0
            ? `${r.unresolved}대는 수도권 밖 구간이라 위치를 표시하지 않았습니다.`
            : undefined,
          CACHE_SEC,
        );
      }
    } catch (e) {
      console.error("[bus-positions:gbis]", e);
    }
  }

  try {
    const result = await fetchBusPositions(dataKey, routeId);
    if (!result) {
      return fail(base, "지금 이 노선의 위치 정보를 찾지 못했습니다.");
    }
    return ok(
      {
        routeId,
        routeName,
        positions: result.positions,
        cityName: result.cityName,
        source: "tago" as const,
        unresolved: 0,
        updatedAt: nowISO(),
      } satisfies BusPositionsPayload,
      undefined,
      CACHE_SEC,
    );
  } catch (e) {
    console.error("[bus-positions:tago]", e);
    return fail(base, `버스 위치 조회 실패: ${e instanceof Error ? e.message : e}`);
  }
}

async function manyRoutes(raw: string) {
  const wanted = raw
    .split(",")
    .map((pair) => {
      const [id, name] = pair.split(":");
      return {
        id: (id ?? "").replace(/[^0-9]/g, "").slice(0, 20),
        name: decodeURIComponent(name ?? "").slice(0, 40),
      };
    })
    .filter((r) => r.id)
    .slice(0, MAX_ROUTES);

  if (wanted.length === 0) {
    return ok({ routes: [] as BusPositionsPayload[], updatedAt: nowISO() }, undefined, CACHE_SEC);
  }

  const dataKey = process.env.GBIS_SERVICE_KEY;
  const ggKey = process.env.GG_DATA_KEY;
  if (!dataKey) {
    return fail(
      { routes: [] as BusPositionsPayload[], updatedAt: "" },
      "버스 인증키가 설정되지 않았습니다.",
    );
  }

  /*
   * 한 노선이 실패해도 나머지는 보여준다. 여덟 대를 한 번에 그리는
   * 화면에서 하나 때문에 전부 사라지면 안 된다.
   */
  const settled = await Promise.allSettled(
    wanted.map(async (r) => {
      if (ggKey) {
        try {
          const g = await fetchGbisPositions(dataKey, ggKey, r.id);
          if (g.positions.length > 0) {
            return {
              routeId: r.id,
              routeName: r.name,
              positions: g.positions,
              cityName: "",
              source: "gbis" as const,
              unresolved: g.unresolved,
              updatedAt: nowISO(),
            } satisfies BusPositionsPayload;
          }
        } catch {
          /* TAGO 로 넘어간다 */
        }
      }
      const t = await fetchBusPositions(dataKey, r.id);
      if (!t) return null;
      return {
        routeId: r.id,
        routeName: r.name,
        positions: t.positions,
        cityName: t.cityName,
        source: "tago" as const,
        unresolved: 0,
        updatedAt: nowISO(),
      } satisfies BusPositionsPayload;
    }),
  );

  /*
   * 의왕 안을 달리는 버스만 남긴다.
   *
   * 노선은 의왕을 지나지만 대부분의 차량은 안양·광명·수원 구간에 있다.
   * 실측하면 여섯 노선 55대 중 의왕 안은 일부뿐이다. 전부 찍으면
   * 의왕 지도가 이웃 도시 버스로 뒤덮인다.
   *
   * 한 대도 안 남은 노선도 빈 채로 돌려준다. 지워버리면 화면이
   * "아직 안 받았다" 와 "지금 없다" 를 구별하지 못한다 — 둘 다
   * 목록에 없기 때문이다. 빈 노선을 자리에서 내보내려면 그 구별이
   * 필요하다.
   */
  const routes = settled
    .map((s) => (s.status === "fulfilled" ? s.value : null))
    .filter((v): v is BusPositionsPayload => !!v)
    .map((r) => ({
      ...r,
      positions: r.positions.filter((p) => isInsideUiwang(p.lat, p.lng)),
    }));

  return ok({ routes, updatedAt: nowISO() }, undefined, CACHE_SEC);
}
