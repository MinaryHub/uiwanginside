"use client";

import { useEffect, useRef, useState } from "react";
import { CATEGORY_MAP } from "@/lib/uiwang";
import { UIWANG_BOUNDARY } from "@/lib/uiwang-boundary";
import { DONG_BOUNDARIES } from "@/lib/dong-boundaries";
import { LEVEL_COLOR, type TrafficLevel, type TrafficSegment } from "@/lib/traffic";
import "leaflet/dist/leaflet.css";
import { planRun, walk, type LatLng, type PathRun } from "@/lib/busPath";
import type { Cctv } from "@/lib/cctvTypes";
import type {
  Place,
  Incident,
  BusStop,
  BusPositionsPayload,
} from "@/lib/types";

/**
 * 버스를 두 관측 지점 사이로 옮기는 데 쓰는 시간.
 *
 * 예전에는 16초로 고정했다 (GBIS 갱신 주기). 그런데 GBIS 가 주는 것은
 * GPS 가 아니라 "몇 번째 정류소에 있다" 이고, 버스가 정류소를 옮기는
 * 간격은 30초~1분이 흔하다. 16초 만에 도착해 놓고 한참 서 있다가 다시
 * 튀어 나가, 가다 서다를 되풀이했다.
 *
 * 이제 버스마다 실제로 정류소를 옮긴 간격을 재어 그만큼에 걸쳐 움직인다.
 * 다음 관측이 올 즈음 닿으므로 멈추지 않고 이어 간다. 처음 한 번은 잴 수
 * 없어 기본값을 쓴다.
 */
const BUS_TWEEN_DEFAULT_MS = 20_000;
const BUS_TWEEN_MIN_MS = 8_000;
const BUS_TWEEN_MAX_MS = 60_000;
/** 사라질 때 흐려지는 시간 */
const BUS_FADE_MS = 400;

/**
 * 출발은 살짝 천천히, 정류소에 닿을 때도 살짝 천천히.
 * 완전한 가속·감속 곡선은 이어지는 구간마다 울컥거려 보여 직선과 반반 섞는다.
 */
function busEase(t: number): number {
  return 0.5 * t + 0.5 * (0.5 - 0.5 * Math.cos(Math.PI * t));
}

let sdkPromise: Promise<void> | null = null;

/**
 * 지도 엔진을 불러온다.
 *
 * 예전에는 카카오맵 SDK 였다. 키와 도메인 등록이 있어야 해서 배포 주소가
 * 바뀌거나 키가 빠지면 지도가 통째로 비었다. 이제 Leaflet 과 공개 지도
 * 타일을 쓰고, 카카오 API 모양을 흉내 내는 얇은 층(mapShim)을 깐다.
 * 아래 코드는 그대로 window.kakao.maps 를 부른다.
 */
function loadSdk(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.kakao?.maps?.Map) return Promise.resolve();
  if (sdkPromise) return sdkPromise;
  sdkPromise = Promise.all([import("leaflet"), import("@/lib/mapShim")]).then(
    ([L, shim]) => shim.installKakaoShim(L.default ?? L),
  );
  return sdkPromise;
}

const INCIDENT_STYLE: Record<Incident["kind"], { emoji: string; color: string }> = {
  accident: { emoji: "🚨", color: "var(--danger)" },
  construction: { emoji: "🚧", color: "#d97706" },
  closure: { emoji: "⛔", color: "#7c2d12" },
  weather: { emoji: "🌧️", color: "#2563eb" },
  etc: { emoji: "❗", color: "#6b7280" },
};

function pinEl(
  emoji: string,
  color: string,
  label: string,
  opts: { active?: boolean; pulse?: boolean } = {},
) {
  const el = document.createElement("div");
  // 지도 위 라벨은 배경 지도와 대비가 확실해야 읽힌다.
  // 다크모드에서도 흰 알약을 유지해 지도 타일 위 가독성을 지킨다.
  const active = !!opts.active;
  el.style.cssText = `
    display:flex;align-items:center;gap:4px;
    padding:${active ? "4px 9px 4px 6px" : "2px 7px 2px 4px"};border-radius:999px;
    background:${active ? color : "rgba(255,255,255,0.96)"};
    color:${active ? "#fff" : "#16202b"};
    border:${active ? 2 : 1}px solid ${color};
    box-shadow:0 1px ${active ? 8 : 4}px rgba(16,32,43,${active ? 0.3 : 0.16});
    font-size:${active ? 12 : 11}px;font-weight:${active ? 800 : 600};
    white-space:nowrap;cursor:pointer;letter-spacing:-.02em;
    transform:translateY(-2px);
    font-family:Pretendard,-apple-system,"Apple SD Gothic Neo",sans-serif;`;
  if (opts.pulse) el.classList.add("pulse");
  el.innerHTML = `<span style="font-size:${active ? 12 : 11}px">${emoji}</span><span>${label}</span>`;
  return el;
}

/** 넓게 볼 때 쓰는 점 마커 — 이름표 없이 위치와 종류만 알린다 */
function dotEl(color: string, emoji: string) {
  const el = document.createElement("div");
  el.style.cssText = `
    display:grid;place-items:center;width:16px;height:16px;border-radius:999px;
    background:rgba(255,255,255,0.96);border:2px solid ${color};
    box-shadow:0 1px 3px rgba(16,32,43,.2);font-size:8px;line-height:1;cursor:pointer;`;
  el.textContent = emoji;
  return el;
}

/**
 * 소통상태별 선 모양.
 * 원활한 길까지 진하게 칠하면 지도가 온통 선으로 덮여 정작 막히는 곳이
 * 묻힌다. 원활은 옅게 깔고, 막힐수록 굵고 진하게 한다.
 */
const STROKE: Record<TrafficLevel, { strokeColor: string; strokeWeight: number; strokeOpacity: number }> = {
  smooth: { strokeColor: LEVEL_COLOR.smooth, strokeWeight: 4, strokeOpacity: 0.3 },
  slow: { strokeColor: LEVEL_COLOR.slow, strokeWeight: 5, strokeOpacity: 0.75 },
  congested: { strokeColor: LEVEL_COLOR.congested, strokeWeight: 6, strokeOpacity: 0.85 },
};

/**
 * 화면에 고르게 흩어 놓는다.
 *
 * 전에는 중심에서 가까운 순으로 앞에서 40개를 잘랐다. 목록이 거리순으로
 * 정렬돼 오므로 잘라낸 결과는 언제나 가운데 뭉치였고, 가장자리는 통째로
 * 비었다. 마커 과밀을 막으려던 장치가 정반대 문제를 만들고 있었다.
 *
 * 이제는 화면을 마커 크기만 한 칸으로 나눠 칸마다 하나씩만 남긴다.
 * 덜어내는 것은 어차피 겹쳐서 안 보였을 것뿐이라 어느 구석도 비지 않고,
 * 남는 수는 화면 크기에 따라 저절로 정해진다. 화면 밖 한 칸까지 두어
 * 살짝 끌었을 때 가장자리가 늦게 차는 일이 없게 한다.
 */
function spread(
  map: kakao.maps.Map,
  container: HTMLDivElement | null,
  places: Place[],
  labelled: boolean,
  selectedId: string | null,
): Place[] {
  const w = container?.clientWidth ?? 0;
  const h = container?.clientHeight ?? 0;
  if (!w || !h || places.length === 0) return places;

  const b = map.getBounds();
  const sw = b.getSouthWest();
  const ne = b.getNorthEast();
  const spanLng = ne.getLng() - sw.getLng();
  const spanLat = ne.getLat() - sw.getLat();
  if (spanLng <= 0 || spanLat <= 0) return places;

  /*
   * 칸 크기가 곧 마커 사이 최소 간격이다. 점 마커가 16px 이라 22px 이면
   * 서로 닿지 않으면서 가장 촘촘하다. 30px 에서 22px 로 좁히니 같은
   * 데이터로 그려지는 마커가 102개에서 129개로 늘었다 — 호출은 그대로다.
   * 이름표가 붙는 확대 수준에서는 가로로 넓게 자리를 먹는다.
   */
  const cellW = labelled ? 116 : 22;
  const cellH = labelled ? 40 : 22;
  const cols = Math.max(1, Math.round(w / cellW));
  const rows = Math.max(1, Math.round(h / cellH));

  const taken = new Set<string>();
  const out: Place[] = [];
  for (const p of places) {
    if (p.id === selectedId) continue; // 고른 곳은 아래에서 무조건 넣는다
    const cx = Math.floor(((p.lng - sw.getLng()) / spanLng) * cols);
    const cy = Math.floor(((p.lat - sw.getLat()) / spanLat) * rows);
    if (cx < -1 || cy < -1 || cx > cols || cy > rows) continue;
    const k = `${cx}:${cy}`;
    if (taken.has(k)) continue;
    taken.add(k);
    out.push(p);
  }
  const picked = selectedId ? places.find((p) => p.id === selectedId) : undefined;
  if (picked) out.push(picked);
  return out;
}

/**
 * 내 위치.
 * 다른 마커와 성격이 달라 (내가 어디 있는지) 이름표 없이 점 하나로 둔다.
 * 바깥 테두리는 위치 오차가 아니라 눈에 띄게 하려는 것이다 — 오차를
 * 원으로 그리면 그 크기가 곧 정확도로 읽히는데, 그렇게까지 정확하지 않다.
 */
function meEl() {
  const el = document.createElement("div");
  el.title = "내 위치";
  el.style.cssText = `
    width:18px;height:18px;border-radius:999px;background:#1a5fb4;
    border:3px solid #fff;box-shadow:0 0 0 3px rgba(26,95,180,.28),0 2px 6px rgba(16,32,43,.35);`;
  return el;
}

/**
 * 운행 중인 버스.
 *
 * 예전에는 노선번호에 정류소 이름·혼잡도·저상 여부까지 한 줄에 담았다.
 * 노선 하나를 좇을 때는 괜찮았지만, 근처 여섯 노선 스무 대를 함께
 * 띄우기 시작하니 알약이 지도를 덮었다. 장소 핀보다 두 배 넓었다.
 *
 * 기본은 노선번호만. 무엇이 어디 있는지는 그것으로 충분하다.
 * 가까이 봤을 때(또는 한 노선을 좇을 때)만 정류소와 혼잡도를 붙인다 —
 * 그때는 마커 수가 적어 자리가 있고, 알고 싶은 것도 더 자세하다.
 */
function busEl(
  routeName: string,
  b: BusPositionsPayload["positions"][number],
  detailed: boolean,
) {
  // 혼잡할수록 붉게. 색만으로 판단하지 않도록 자세히 볼 때는 라벨도 붙인다.
  const CROWD = ["", "여유", "보통", "혼잡", "매우혼잡"];
  const bg =
    b.crowded === 4 || b.crowded === 3 ? "#e03131" : b.crowded === 2 ? "#e8590c" : "#1c7ed6";
  const el = document.createElement("div");
  el.title = [routeName, b.nodeName, b.crowded ? CROWD[b.crowded] : "", b.lowPlate ? "저상" : ""]
    .filter(Boolean)
    .join(" · ");
  el.style.cssText = `
    display:flex;align-items:center;gap:${detailed ? 5 : 3}px;
    padding:${detailed ? "3px 8px 3px 6px" : "1px 6px 1px 4px"};border-radius:999px;
    background:${bg};color:#fff;border:2px solid #23201c;
    box-shadow:2px 2px 0 #23201c;animation:bus-in .35s cubic-bezier(.34,1.56,.64,1) both;
    transition:opacity ${BUS_FADE_MS}ms ease;
    font-size:${detailed ? 12 : 10}px;font-weight:800;white-space:nowrap;letter-spacing:-.02em;
    font-family:Pretendard,-apple-system,"Apple SD Gothic Neo",sans-serif;`;
  el.innerHTML =
    `<span style="font-size:${detailed ? 12 : 9}px">🚍</span><span>${routeName}</span>` +
    // 가는 쪽. 움직이기 전에는 모르므로 숨겨 둔다 (아래 애니메이션이 돌린다)
    `<span data-dir style="display:inline-block;font-size:${detailed ? 9 : 7}px;line-height:1;` +
    `opacity:0;transition:transform .5s ease,opacity .3s ease">▲</span>` +
    (detailed && b.nodeName
      ? `<span style="font-weight:600;opacity:.88">${b.nodeName.slice(0, 10)}</span>`
      : "") +
    (detailed && b.crowded
      ? `<span style="font-weight:700;opacity:.95">${CROWD[b.crowded] ?? ""}</span>`
      : "") +
    (detailed && b.lowPlate ? `<span title="저상버스" style="opacity:.9">♿</span>` : "");
  return el;
}


/** 두 방향의 차 (-180~180). 화살표가 359°→1° 에서 한 바퀴 돌지 않게 */
function angleDiff(a: number, b: number): number {
  return ((((a - b) % 360) + 540) % 360) - 180;
}

/** 버스 알약 안의 화살표를 가는 쪽으로 */
function aimArrow(el: HTMLElement, heading: number | null, animate: boolean) {
  const arrow = el.querySelector<HTMLElement>("[data-dir]");
  if (!arrow || heading === null) return;
  if (!animate) arrow.style.transition = "none";
  arrow.style.transform = `rotate(${heading}deg)`;
  arrow.style.opacity = "1";
}

export interface KakaoMapProps {
  center: { lat: number; lng: number };
  level: number;
  places: Place[];
  incidents: Incident[];
  busStops: BusStop[];
  /** 진료중인 병원·약국 (의료 모드) */
  medicalOpen: { id: string; name: string; kind: string; lat: number | null; lng: number | null }[];
  /** 추적 중인 노선의 실시간 버스 위치 */
  /**
   * 실시간 버스. 노선 하나를 좇을 때는 한 개, 근처 노선을 함께 볼 때는
   * 여럿이 들어온다. 여럿을 다루는 쪽으로 통일했다.
   */
  busPositions: BusPositionsPayload[];
  /** 노선별 실제 주행 경로 — 버스를 그 위로 움직인다 */
  busPaths: Record<string, LatLng[]>;
  /** 랜드마크 (둘러보기 모드) */
  landmarks: { name: string; lat: number; lng: number; desc: string }[];
  /** 도로 소통상태 — 도로 형상에 ITS 속도를 입힌 조각들 */
  trafficSegments: TrafficSegment[];
  /** 내 위치 — 알아냈을 때만 */
  me: { lat: number; lng: number } | null;
  /** 도로 CCTV */
  cctvs: Cctv[];
  onSelectCctv: (c: Cctv) => void;
  /** 의왕시 행정경계 표시 */
  showBoundary: boolean;
  /** 강조할 행정동 이름 (null 이면 없음) */
  activeDong: string | null;
  /**
   * 이 범위가 화면에 다 들어오도록 맞춘다.
   * 새 객체가 오면 다시 맞추므로, 같은 동을 다시 눌러도 동작한다.
   */
  fitBounds: { minLat: number; maxLat: number; minLng: number; maxLng: number } | null;
  /** setBounds 로 뷰가 바뀐 뒤 실제 중심·확대 수준을 알려준다 */
  onViewFitted: (center: { lat: number; lng: number }, level: number) => void;
  /** 경계 바깥을 어둡게 덮어 시 영역을 강조 */
  dimOutside: boolean;
  /** 시트가 열려 지도 폭이 바뀌었는지 — 바뀌면 relayout 이 필요하다 */
  sheetOpen: boolean;
  selectedPlaceId: string | null;
  /** 정류소·사고 등 지도에서 고른 대상 */
  selectedMarkerId: string | null;
  onSelectPlace: (p: Place) => void;
  onSelectStop: (s: BusStop) => void;
  onSelectIncident: (i: Incident) => void;
  onMapMoved: (c: { lat: number; lng: number }) => void;
  /** 지도가 멈출 때마다 화면 범위를 알린다 (minLng,minLat,maxLng,maxLat) */
  onBoundsChanged: (rect: string, center: { lat: number; lng: number }, level: number) => void;
}

export default function KakaoMap({
  center,
  level,
  places,
  incidents,
  busStops,
  medicalOpen,
  busPositions,
  busPaths,
  landmarks,
  trafficSegments,
  me,
  cctvs,
  onSelectCctv,
  showBoundary,
  activeDong,
  fitBounds,
  sheetOpen,
  onViewFitted,
  dimOutside,
  selectedPlaceId,
  selectedMarkerId,
  onSelectPlace,
  onSelectStop,
  onSelectIncident,
  onMapMoved,
  onBoundsChanged,
}: KakaoMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<kakao.maps.Map | null>(null);
  /**
   * 마커를 종류별로 따로 관리한다.
   * 하나로 묶으면 15초마다 오는 버스 위치 갱신에도 장소 마커까지 전부
   * 지웠다 다시 그려서 화면이 깜빡인다.
   */
  /**
   * 장소 마커는 배열이 아니라 키로 들고 있는다.
   * 다시 그릴 때 무엇이 그대로인지 알아야 손대지 않고 둘 수 있다.
   */
  const placeMarks = useRef(
    new Map<string, { ov: kakao.maps.CustomOverlay; sig: string; place?: Place }>(),
  );
  /** 정류소·사고·CCTV — 장소와 같이 키로 들고 있어야 확대할 때 깜빡이지 않는다 */
  const transitMarks = useRef(
    new Map<string, { ov: kakao.maps.CustomOverlay; sig: string; hit?: () => void }>(),
  );
/**
 * 버스는 차량번호로 들고 있는다. 갱신마다 지웠다 만들면 방금 지나간
 * 위치를 이어 붙일 수 없고, 마커가 깜빡인다.
 */
  const busMarks = useRef(
    new Map<
      string,
      {
        ov: kakao.maps.CustomOverlay;
        /** 이번 구간의 출발점 — 새 관측이 왔을 때 화면에 있던 자리 */
        from: { lat: number; lng: number };
        /** 방금 관측된 위치 */
        to: { lat: number; lng: number };
        /** to 를 받은 시각 */
        at: number;
        /** 이번 구간에 걸리는 시간 (ms) */
        dur: number;
        /** 지금 화면에 그려진 자리 */
        shown: { lat: number; lng: number };
        /** 이 버스가 정류소를 옮겨 다닌 간격 (지수평균, ms). 아직 모르면 null */
        gap: number | null;
        /** 가는 쪽 (도, 북=0 시계방향). 아직 모르면 null */
        heading: number | null;
        /**
         * 가는 쪽을 마지막으로 잰 자리. 한 프레임에 0.2m 남짓 움직이므로
         * 프레임끼리 비교하면 늘 너무 짧다 — 몇 미터 쌓인 뒤에 잰다.
         */
        headFrom: { lat: number; lng: number };
        /** 구간 끝에 닿아 더 옮길 것이 없다 */
        done: boolean;
        /**
         * 노선 경로를 따라 걷는 구간. 경로가 없거나 붙이기가 어긋나면
         * null 이고, 그때는 두 점을 직선으로 잇는다.
         */
        run: PathRun | null;
        sig: string;
      }
    >(),
  );
  const busRaf = useRef<number | null>(null);
  const meRef = useRef<kakao.maps.CustomOverlay | null>(null);
  const boundaryRef = useRef<kakao.maps.Polygon[]>([]);
  const dongRef = useRef<kakao.maps.Polygon[]>([]);
  /** 소통정보 선. 45초마다 색만 바뀌므로 마커와 같은 방식으로 재사용한다. */
  const roadLines = useRef(
    new Map<string, { line: kakao.maps.Polyline; level: TrafficLevel }>(),
  );
  const movedRef = useRef(onMapMoved);
  const fittedRef = useRef(onViewFitted);
  const boundsRef = useRef(onBoundsChanged);
  // 마커를 그대로 두고 재사용하므로, 붙여둔 클릭 핸들러가 낡지 않게 ref 로 읽는다
  const selectRef = useRef(onSelectPlace);
  /**
   * 시트가 열려 있는지. deps 에 넣으면 시트를 여닫을 때마다 지도가
   * 다시 맞춰져 제멋대로 움직인다. 범위를 맞추는 순간에만 들여다본다.
   */
  const sheetRef = useRef(sheetOpen);
  /**
   * 지도가 스스로 알려준 중심·확대 수준.
   *
   * 이 값이 부모를 거쳐 prop 으로 되돌아왔을 때 다시 panTo 를 부르면 안 된다.
   * panTo 가 착지하는 지점은 픽셀 단위로 반올림되어 요청한 좌표와 미세하게
   * 어긋나고, 그 차이가 또 상태를 바꿔 지도가 끝없이 조금씩 흘러간다.
   * 객체 자체를 기억해 두고 같은 것이 돌아오면 무시한다.
   */
  const echoRef = useRef<{ center: { lat: number; lng: number } | null; level: number | null }>({
    center: null,
    level: null,
  });
  const [ready, setReady] = useState(false);
  const [sdkError, setSdkError] = useState<string | null>(null);

  const error = sdkError;

  // 최신 콜백을 ref 로 유지 — 지도 재생성 없이 dragend 핸들러가 최신 함수를 참조
  useEffect(() => {
    movedRef.current = onMapMoved;
    fittedRef.current = onViewFitted;
    boundsRef.current = onBoundsChanged;
    selectRef.current = onSelectPlace;
    sheetRef.current = sheetOpen;
  }, [onMapMoved, onViewFitted, onBoundsChanged, onSelectPlace, sheetOpen]);

  // SDK 로드 + 지도 생성
  useEffect(() => {
    let cancelled = false;
    loadSdk()
      .then(() => {
        if (cancelled || !containerRef.current || mapRef.current) return;
        const map = new window.kakao.maps.Map(containerRef.current, {
          center: new window.kakao.maps.LatLng(center.lat, center.lng),
          level,
        });
        mapRef.current = map;
        const report = () => {
          const c = map.getCenter();
          const b = map.getBounds();
          const sw = b.getSouthWest();
          const ne = b.getNorthEast();
          const here = { lat: c.getLat(), lng: c.getLng() };
          const lv = map.getLevel();
          // 되돌아온 값을 알아보려고 넘긴 객체 그대로를 기억해 둔다
          echoRef.current = { center: here, level: lv };
          movedRef.current(here);
          boundsRef.current(
            `${sw.getLng()},${sw.getLat()},${ne.getLng()},${ne.getLat()}`,
            here,
            lv,
          );
        };
        // idle 은 드래그·확대·축소·setBounds 를 모두 아우른다
        window.kakao.maps.event.addListener(map, "idle", report);
        report();
        setReady(true);
      })
      .catch((e: Error) => setSdkError(e.message));
    return () => {
      cancelled = true;
    };
    // 최초 1회만 — center/level 변경은 아래 effect 가 처리
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 시트가 열리고 닫히면 지도 컨테이너 폭이 바뀐다.
  // relayout 을 부르지 않으면 타일이 어긋난 채 남아 "일부 구역에만 보이는" 것처럼 된다.
  useEffect(() => {
    if (!ready || !mapRef.current) return;
    const t = setTimeout(() => mapRef.current?.relayout(), 220);
    return () => clearTimeout(t);
  }, [ready, sheetOpen]);

  /**
   * 범위 맞춤. 동 경계처럼 크기가 제각각인 영역을 화면에 담을 때 쓴다.
   * 맞춘 뒤 실제 중심·확대 수준을 위로 알려, 주변 장소 조회가 새 위치를 따르게 한다.
   */
  useEffect(() => {
    if (!ready || !mapRef.current || !fitBounds) return;
    const map = mapRef.current;
    const b = new window.kakao.maps.LatLngBounds();
    b.extend(new window.kakao.maps.LatLng(fitBounds.minLat, fitBounds.minLng));
    b.extend(new window.kakao.maps.LatLng(fitBounds.maxLat, fitBounds.maxLng));
    /*
     * 경계선이 화면 끝에 붙지 않도록 여백을 준다.
     *
     * 넓은 화면에서 시트가 열려 있으면 지도의 왼쪽 360px 은 목록에
     * 덮여 있다. 지도 컨테이너는 늘 화면 전체라 그대로 가운데를 맞추면
     * 찾던 곳이 목록 뒤로 들어간다. 그만큼 왼쪽을 비켜 놓고 맞춘다.
     * 좁은 화면은 시트가 통째로 덮으므로 따질 것이 없다.
     */
    const wide = (containerRef.current?.clientWidth ?? 0) >= 640;
    const left = wide && sheetRef.current ? 384 : 48;
    map.setBounds(b, 48, 48, 48, left);
    const c = map.getCenter();
    const here = { lat: c.getLat(), lng: c.getLng() };
    const lv = map.getLevel();
    echoRef.current = { center: here, level: lv };
    fittedRef.current(here, lv);
  }, [ready, fitBounds]);

  // 바깥에서 center 가 바뀌면 이동한다.
  // 단, 지도가 직접 알려준 값이 돌아온 것이면 이미 그 자리에 있으므로 놔둔다.
  useEffect(() => {
    if (!ready || !mapRef.current) return;
    if (center === echoRef.current.center) return;
    mapRef.current.panTo(new window.kakao.maps.LatLng(center.lat, center.lng));
  }, [ready, center]);

  useEffect(() => {
    if (!ready || !mapRef.current) return;
    if (level === echoRef.current.level) return;
    mapRef.current.setLevel(level, { animate: true });
  }, [ready, level]);

  // 의왕시 행정경계 + 바깥 영역 딤 처리
  useEffect(() => {
    if (!ready || !mapRef.current) return;
    const map = mapRef.current;
    boundaryRef.current.forEach((p) => p.setMap(null));
    boundaryRef.current = [];
    if (!showBoundary) return;

    const ring = UIWANG_BOUNDARY.map(
      ([lat, lng]) => new window.kakao.maps.LatLng(lat, lng),
    );

    if (dimOutside) {
      // 넓은 사각형을 외곽으로, 시 경계를 구멍으로 둬서 바깥만 덮는다.
      const world = [
        new window.kakao.maps.LatLng(30, 120),
        new window.kakao.maps.LatLng(30, 134),
        new window.kakao.maps.LatLng(44, 134),
        new window.kakao.maps.LatLng(44, 120),
      ];
      const mask = new window.kakao.maps.Polygon({
        path: [world, ring],
        strokeWeight: 0,
        strokeOpacity: 0,
        fillColor: "#0b0f14",
        // 구멍이 적용되지 않더라도 지도가 가려지지 않도록 낮게 유지한다
        fillOpacity: 0.28,
        zIndex: 1,
      });
      mask.setMap(map);
      boundaryRef.current.push(mask);
    }

    const outline = new window.kakao.maps.Polygon({
      path: ring,
      strokeWeight: 3,
      strokeColor: "#0f6b60",
      strokeOpacity: 0.95,
      strokeStyle: "solid",
      fillColor: "#0f6b60",
      fillOpacity: dimOutside ? 0 : 0.06,
      zIndex: 2,
    });
    outline.setMap(map);
    boundaryRef.current.push(outline);
  }, [ready, showBoundary, dimOutside]);

  // 선택한 행정동 경계 강조
  useEffect(() => {
    if (!ready || !mapRef.current) return;
    const map = mapRef.current;
    dongRef.current.forEach((p) => p.setMap(null));
    dongRef.current = [];
    if (!activeDong) return;

    const ring = DONG_BOUNDARIES[activeDong];
    if (!ring) return;

    const path = ring.map(([lat, lng]) => new window.kakao.maps.LatLng(lat, lng));
    const poly = new window.kakao.maps.Polygon({
      path,
      strokeWeight: 3,
      strokeColor: "#1a5fb4",
      strokeOpacity: 0.95,
      strokeStyle: "solid",
      fillColor: "#1a5fb4",
      fillOpacity: 0.12,
      // 시 경계(2)보다 위, 마커(10+)보다 아래
      zIndex: 5,
    });
    poly.setMap(map);
    dongRef.current.push(poly);
  }, [ready, activeDong]);

  /**
   * 도로 소통상태.
   *
   * 45초마다 새 값이 오는데, 선은 그대로고 색만 바뀌는 경우가 대부분이다.
   * 지웠다 다시 그리면 도로망 전체가 한 번 깜빡이므로, 마커와 마찬가지로
   * 키로 들고 있으면서 색이 달라진 것만 setOptions 로 갈아 끼운다.
   */
  useEffect(() => {
    if (!ready || !mapRef.current) return;
    const map = mapRef.current;
    const live = roadLines.current;
    const want = new Map(trafficSegments.map((s) => [s.key, s]));

    for (const [key, entry] of live) {
      if (!want.has(key)) {
        entry.line.setMap(null);
        live.delete(key);
      }
    }

    for (const [key, seg] of want) {
      const cur = live.get(key);
      if (cur) {
        if (cur.level !== seg.level) {
          cur.line.setOptions(STROKE[seg.level]);
          cur.level = seg.level;
        }
        continue;
      }
      const line = new window.kakao.maps.Polyline({
        path: seg.path.map(([lat, lng]) => new window.kakao.maps.LatLng(lat, lng)),
        strokeStyle: "solid",
        // 경계선(2)·동(5) 위, 마커(10+) 아래
        zIndex: 6,
        ...STROKE[seg.level],
      });
      line.setMap(map);
      live.set(key, { line, level: seg.level });
    }
  }, [ready, trafficSegments]);

  // 검색 반경 원은 그리지 않는다.
  // 큰 점선 원이 "이 밖은 없음" 처럼 읽혀 화면이 제한된 구역처럼 보였다.
  // 반경은 시트의 슬라이더로 조절하고, 결과는 마커 자체로 드러난다.

  /**
   * 장소·병원·랜드마크 마커.
   *
   * 이름표는 아주 가까이 봤을 때만. 그 밖에는 작은 점으로 위치만 알린다.
   * 선택한 곳은 확대 수준과 무관하게 이름표를 붙인다.
   *
   * 지웠다 다시 만들지 않고 달라진 것만 손댄다. 전부 다시 그리면
   * 확대·축소할 때마다 마커가 한 번 사라졌다 나타난다 — 데이터가 새로
   * 도착할 때마다 같은 마커를 지웠다 같은 자리에 다시 만들기 때문이다.
   * 모바일에서는 그 사이가 눈에 보일 만큼 길다.
   */
  useEffect(() => {
    if (!ready || !mapRef.current) return;
    const map = mapRef.current;
    const labelled = level <= 2;

    /** 겉모습이 같으면 손대지 않는다 */
    type Want = {
      lat: number;
      lng: number;
      sig: string;
      zIndex: number;
      el: () => HTMLElement;
      payload?: Place;
    };
    const want = new Map<string, Want>();

    for (const p of spread(map, containerRef.current, places, labelled, selectedPlaceId)) {
      const def = CATEGORY_MAP[p.category];
      if (!def) continue;
      const active = selectedPlaceId === p.id;
      const pin = active || labelled;
      want.set(`p:${p.id}`, {
        lat: p.lat,
        lng: p.lng,
        sig: `${pin ? "pin" : "dot"}|${active}|${p.category}|${p.name}`,
        zIndex: active ? 90 : 10,
        el: () =>
          pin ? pinEl(def.emoji, def.color, p.name, { active }) : dotEl(def.color, def.emoji),
        payload: p,
      });
    }

    // 진료중인 곳은 수가 적고 중요도가 높아 항상 이름표를 붙인다
    for (const m of medicalOpen.slice(0, 40)) {
      if (m.lat == null || m.lng == null) continue;
      want.set(`m:${m.id}`, {
        lat: m.lat,
        lng: m.lng,
        sig: `med|${m.kind}|${m.name}`,
        zIndex: 60,
        el: () => pinEl(m.kind === "pharmacy" ? "💊" : "🏥", "#17734f", m.name),
      });
    }

    for (const l of landmarks) {
      want.set(`l:${l.name}`, {
        lat: l.lat,
        lng: l.lng,
        sig: `mark|${l.name}`,
        zIndex: 50,
        el: () => pinEl("📍", "#7c3aed", l.name),
      });
    }

    const live = placeMarks.current;

    // 사라진 것만 지운다
    for (const [key, entry] of live) {
      if (!want.has(key)) {
        entry.ov.setMap(null);
        live.delete(key);
      }
    }

    for (const [key, w] of want) {
      const cur = live.get(key);
      if (!cur) {
        const el = w.el();
        el.addEventListener("click", () => {
          const e = live.get(key);
          if (e?.place) selectRef.current(e.place);
        });
        const ov = new window.kakao.maps.CustomOverlay({
          position: new window.kakao.maps.LatLng(w.lat, w.lng),
          content: el,
          yAnchor: 1,
          zIndex: w.zIndex,
          clickable: true,
        });
        ov.setMap(map);
        live.set(key, { ov, sig: w.sig, place: w.payload });
        continue;
      }
      // 같은 마커가 그대로 있으면 최신 데이터만 갈아 끼우고 둔다
      cur.place = w.payload;
      if (cur.sig !== w.sig) {
        const el = w.el();
        el.addEventListener("click", () => {
          const e = live.get(key);
          if (e?.place) selectRef.current(e.place);
        });
        cur.ov.setContent(el);
        cur.ov.setZIndex(w.zIndex);
        cur.sig = w.sig;
      }
    }
  }, [
    ready,
    level,
    places,
    medicalOpen,
    landmarks,
    selectedPlaceId,
    onSelectPlace,
  ]);

  /** 내 위치 — 다른 무엇이 바뀌든 이것 때문에 다시 그리지 않는다 */
  useEffect(() => {
    if (!ready || !mapRef.current) return;
    if (!me) {
      meRef.current?.setMap(null);
      meRef.current = null;
      return;
    }
    const pos = new window.kakao.maps.LatLng(me.lat, me.lng);
    if (meRef.current) {
      meRef.current.setPosition(pos);
      return;
    }
    const ov = new window.kakao.maps.CustomOverlay({
      position: pos,
      content: meEl(),
      yAnchor: 0.5,
      zIndex: 95,
    });
    ov.setMap(mapRef.current);
    meRef.current = ov;
  }, [ready, me]);

  /**
   * 정류소·사고·CCTV.
   *
   * 장소 마커와 같은 방식으로 키를 두고 달라진 것만 손댄다. 전에는
   * 확대·축소할 때마다 통째로 지웠다 다시 만들었다 — deps 에 level 이
   * 있으니 손가락을 벌릴 때마다 정류소와 CCTV 가 한 번씩 사라졌다
   * 나타났다.
   *
   * 확대 수준이 바뀌면 겉모습(점 ↔ 이름표)만 갈아 끼운다. 위치는
   * 그대로이므로 오버레이를 다시 만들 이유가 없다.
   */
  useEffect(() => {
    if (!ready || !mapRef.current) return;
    const map = mapRef.current;
    const labelled = level <= 2;
    const live = transitMarks.current;

    type Want = { lat: number; lng: number; sig: string; z: number; el: () => HTMLElement; hit?: () => void };
    const want = new Map<string, Want>();

    for (const st of busStops.slice(0, 12)) {
      const next = st.arrivals?.[0]?.predictSec;
      const label =
        next != null ? `${st.name} · ${Math.max(1, Math.round(next / 60))}분` : st.name;
      const on = selectedMarkerId === `stop:${st.stationId}`;
      want.set(`stop:${st.stationId}`, {
        lat: st.lat,
        lng: st.lng,
        // 도착 분이 바뀌면 이름표도 바뀌어야 하므로 라벨을 서명에 넣는다
        sig: `${on || labelled ? "pin" : "dot"}|${on}|${label}`,
        z: on ? 92 : 20,
        el: () =>
          on || labelled
            ? pinEl("🚌", "#1a5fb4", label, { active: on })
            : dotEl("#1a5fb4", "🚌"),
        hit: () => onSelectStop(st),
      });
    }

    // 사고는 건수가 적고 가장 중요하므로 항상 이름표 + 강조
    for (const inc of incidents) {
      if (inc.lat == null || inc.lng == null) continue;
      const st = INCIDENT_STYLE[inc.kind];
      const on = selectedMarkerId === `incident:${inc.id}`;
      want.set(`incident:${inc.id}`, {
        lat: inc.lat,
        lng: inc.lng,
        sig: `inc|${on}|${inc.type}`,
        z: 80,
        el: () => pinEl(st.emoji, st.color, inc.type, { pulse: inc.kind === "accident", active: on }),
        hit: () => onSelectIncident(inc),
      });
    }

    // CCTV 는 열다섯 대뿐이고 모두 고속도로 위라 겹치지 않는다.
    for (const c of cctvs) {
      const on = selectedMarkerId === `cctv:${c.id}`;
      want.set(`cctv:${c.id}`, {
        lat: c.lat,
        lng: c.lng,
        sig: `${on || labelled ? "pin" : "dot"}|${on}`,
        z: on ? 92 : 30,
        el: () =>
          on || labelled
            ? pinEl("📹", "#5b21b6", c.name, { active: on })
            : dotEl("#5b21b6", "📹"),
        hit: () => onSelectCctv(c),
      });
    }

    for (const [key, entry] of live) {
      if (!want.has(key)) {
        entry.ov.setMap(null);
        live.delete(key);
      }
    }

    for (const [key, w] of want) {
      const cur = live.get(key);
      const make = () => {
        const el = w.el();
        if (w.hit) el.addEventListener("click", () => live.get(key)?.hit?.());
        return el;
      };
      if (!cur) {
        const ov = new window.kakao.maps.CustomOverlay({
          position: new window.kakao.maps.LatLng(w.lat, w.lng),
          content: make(),
          yAnchor: 1,
          zIndex: w.z,
          clickable: true,
        });
        ov.setMap(map);
        live.set(key, { ov, sig: w.sig, hit: w.hit });
        continue;
      }
      // 핸들러는 매번 갈아 끼운다 — 도착 정보가 바뀌면 넘길 값도 바뀐다
      cur.hit = w.hit;
      if (cur.sig !== w.sig) {
        cur.ov.setContent(make());
        cur.ov.setZIndex(w.z);
        cur.sig = w.sig;
      }
    }

    // 구간속도는 여기서 그리지 않는다. 좌표가 없어 점으로 찍을 수 없고,
    // 도로 형상에 색을 입히는 방식으로 따로 그린다 (위 소통상태 effect).
  }, [
    ready,
    level,
    busStops,
    incidents,
    cctvs,
    onSelectCctv,
    selectedMarkerId,
    onSelectStop,
    onSelectIncident,
  ]);

  /**
   * 운행 중인 버스.
   *
   * GBIS 는 16초에 한 번만 새 위치를 준다 (실측 15.7·15.9·15.7초).
   * 그대로 찍으면 버스가 16초마다 뚝 뛴다. 관측된 두 지점 사이를 그
   * 시간에 걸쳐 이어 움직인다.
   *
   * 지어내지 않기 위해 지키는 것들.
   *  - 실제로 관측된 두 점 사이만 움직인다. 최신 지점을 지나 앞질러
   *    가지 않는다 — 그건 없는 위치를 만드는 것이다.
   *  - 처음 본 차량은 애니메이션 없이 그 자리에 놓는다. 이어 붙일
   *    직전 위치가 없다.
   *  - 16초에 2km 를 넘는 도약은 잇지 않고 건너뛴다. 차고지 회차나
   *    자료 오류이고, 이으면 버스가 시내를 가로지르는 것처럼 보인다.
   */
  useEffect(() => {
    if (!ready || !mapRef.current) return;
    const map = mapRef.current;
    const live = busMarks.current;
    const now = Date.now();

    /*
     * 자세히 보일지. 확대했거나, 화면에 버스가 한 대뿐일 때다.
     * 노선 수가 아니라 버스 수로 센다 — 서버가 빈 노선도 돌려주므로
     * 노선 수는 버스가 몇 대인지 말해주지 않는다.
     */
    const buses = busPositions.reduce((n, r) => n + r.positions.length, 0);
    const detailed = level <= 3 || buses <= 1;
    const seen = new Set<string>();

    for (const r of busPositions) {
      for (const b of r.positions) {
        const key = b.vehicleNo || `${r.routeId}:${b.nodeName}:${b.lat},${b.lng}`;
        seen.add(key);
        const sig = `${detailed}|${r.routeName}|${b.crowded ?? ""}|${b.nodeName}`;
        const cur = live.get(key);

        if (!cur) {
          const ov = new window.kakao.maps.CustomOverlay({
            position: new window.kakao.maps.LatLng(b.lat, b.lng),
            content: busEl(r.routeName || "버스", b, detailed),
            yAnchor: 1,
            zIndex: 95,
          });
          ov.setMap(map);
          live.set(key, {
            ov,
            from: { lat: b.lat, lng: b.lng },
            to: { lat: b.lat, lng: b.lng },
            at: now,
            dur: BUS_TWEEN_DEFAULT_MS,
            shown: { lat: b.lat, lng: b.lng },
            gap: null,
            heading: null,
            headFrom: { lat: b.lat, lng: b.lng },
            done: true,
            run: null,
            sig,
          });
          continue;
        }

        // 같은 자리면 새 구간을 열지 않는다 — 정차 중인 버스가 떨지 않게
        const moved = cur.to.lat !== b.lat || cur.to.lng !== b.lng;
        if (moved) {
          const jump = Math.hypot((b.lat - cur.to.lat) * 111_000, (b.lng - cur.to.lng) * 88_000);
          /*
           * 화면에 지금 있는 자리에서 출발한다. 예전에는 직전 관측 지점에서
           * 출발해, 아직 가는 중에 새 관측이 오면 버스가 앞으로 툭 튀었다.
           */
          cur.from = jump > 2000 ? { lat: b.lat, lng: b.lng } : { ...cur.shown };
          if (jump > 2000) {
            cur.shown = { lat: b.lat, lng: b.lng };
            cur.headFrom = cur.shown;
          }
          // 정류소를 옮긴 간격을 잰다. 너무 짧거나 긴 것(누락·정차 대기)은 버린다
          const sample = now - cur.at;
          if (sample >= 5_000 && sample <= 180_000) {
            cur.gap = cur.gap === null ? sample : cur.gap * 0.6 + sample * 0.4;
          }
          cur.dur = Math.max(
            BUS_TWEEN_MIN_MS,
            Math.min(BUS_TWEEN_MAX_MS, cur.gap ?? BUS_TWEEN_DEFAULT_MS),
          );
          cur.to = { lat: b.lat, lng: b.lng };
          cur.at = now;
          cur.done = false;
          // 노선 경로가 있으면 그 위를 걷는다. 붙이기가 어긋나면 null 이고
          // 그때는 아래 애니메이션이 직선으로 잇는다.
          const line = busPaths[r.routeId];
          cur.run =
            line && line.length > 1
              ? planRun(line, [cur.from.lat, cur.from.lng], [cur.to.lat, cur.to.lng])
              : null;
        }
        if (cur.sig !== sig) {
          const el = busEl(r.routeName || "버스", b, detailed);
          // 내용을 갈아도 가던 방향은 그대로 — 화살표가 매번 처음으로 돌아가지 않게
          aimArrow(el, cur.heading, false);
          el.style.animation = "none";
          cur.ov.setContent(el);
          cur.sig = sig;
        }
      }
    }

    // 운행을 마쳤거나 화면 밖으로 나간 버스는 흐려지며 사라진다
    for (const [key, entry] of live) {
      if (!seen.has(key)) {
        const el = entry.ov.getContent();
        if (el instanceof HTMLElement) el.style.opacity = "0";
        const ov = entry.ov;
        setTimeout(() => ov.setMap(null), BUS_FADE_MS);
        live.delete(key);
      }
    }
    // level 이 빠지면 확대해도 자세히 바뀌지 않는다
  }, [ready, busPositions, level, busPaths]);

  /**
   * 버스를 사이 위치로 옮긴다.
   *
   * 매 프레임 두 관측 지점 사이를 비율로 나눈다. 16초가 지나면 1 에서
   * 멈춘다 — 다음 관측을 앞질러 가지 않는다.
   */
  useEffect(() => {
    if (!ready) return;
    const step = () => {
      const now = Date.now();
      for (const m of busMarks.current.values()) {
        if (m.done) continue;
        const raw = Math.min(1, (now - m.at) / m.dur);
        const t = busEase(raw);
        // 경로를 따라 걷는다. 붙이지 못한 구간만 직선으로 잇는다.
        const [lat, lng] = m.run
          ? walk(m.run, t)
          : [
              m.from.lat + (m.to.lat - m.from.lat) * t,
              m.from.lng + (m.to.lng - m.from.lng) * t,
            ];

        // 가는 쪽 — 6m 는 움직여야 잰다. 정류소 앞 미세한 떨림에 화살표가 돌지 않게
        const dy = (lat - m.headFrom.lat) * 111_000;
        const dx = (lng - m.headFrom.lng) * 88_000;
        if (dx * dx + dy * dy > 36) {
          m.headFrom = { lat, lng };
          const h = (Math.atan2(dx, dy) * 180) / Math.PI;
          if (m.heading === null || Math.abs(angleDiff(h, m.heading)) > 8) {
            m.heading = m.heading === null ? h : m.heading + angleDiff(h, m.heading);
            const el = m.ov.getContent();
            if (el instanceof HTMLElement) aimArrow(el, m.heading, true);
          }
        }

        m.shown = { lat, lng };
        m.ov.setPosition(new window.kakao.maps.LatLng(lat, lng));
        if (raw >= 1) m.done = true;
      }
      busRaf.current = requestAnimationFrame(step);
    };
    busRaf.current = requestAnimationFrame(step);
    return () => {
      if (busRaf.current !== null) cancelAnimationFrame(busRaf.current);
      busRaf.current = null;
    };
  }, [ready]);

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="h-full w-full" />
      {error && (
        <div className="absolute inset-0 grid place-items-center overflow-y-auto bg-[var(--surface-2)] p-6 text-center">
          <div className="max-w-md space-y-3">
            <div className="text-4xl">🗺️</div>
            <p className="font-semibold">지도를 표시할 수 없습니다</p>
            <p className="text-sm text-[var(--text-muted)]">{error}</p>
            <p className="text-xs text-[var(--text-muted)]">
              인터넷 연결을 확인하고 새로고침해 보세요. 메뉴의 목록·실시간 정보는 지도 없이도
              볼 수 있습니다.
            </p>
          </div>
        </div>
      )}
      {!ready && !error && (
        <div className="absolute inset-0 grid place-items-center bg-[var(--surface-2)]">
          <span className="text-sm text-[var(--text-muted)]">지도를 불러오는 중…</span>
        </div>
      )}
    </div>
  );
}
