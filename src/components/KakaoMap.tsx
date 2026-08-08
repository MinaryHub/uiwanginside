"use client";

import { useEffect, useRef, useState } from "react";
import { CATEGORY_MAP } from "@/lib/uiwang";
import { UIWANG_BOUNDARY } from "@/lib/uiwang-boundary";
import { DONG_BOUNDARIES } from "@/lib/dong-boundaries";
import type { Place, Incident, BusStop, TrafficLink } from "@/lib/types";

let sdkPromise: Promise<void> | null = null;

function loadSdk(appKey: string): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.kakao?.maps?.Map) return Promise.resolve();
  if (sdkPromise) return sdkPromise;

  sdkPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${appKey}&autoload=false`;
    script.async = true;
    script.onload = () => window.kakao.maps.load(() => resolve());
    // script 태그의 onerror 로는 HTTP 상태/본문을 읽을 수 없다.
    // 실제 원인은 대부분 도메인 미등록 또는 카카오맵 제품 비활성 둘 중 하나다.
    script.onerror = () =>
      reject(new Error("카카오맵 SDK 를 불러오지 못했습니다 (도메인 미등록 또는 제품 비활성)"));
    document.head.appendChild(script);
  });
  return sdkPromise;
}

const INCIDENT_STYLE: Record<Incident["kind"], { emoji: string; color: string }> = {
  accident: { emoji: "🚨", color: "#dc2626" },
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
  el.style.cssText = `
    display:flex;align-items:center;gap:5px;
    padding:4px 9px 4px 5px;border-radius:999px;
    background:${opts.active ? color : "rgba(255,255,255,0.97)"};
    color:${opts.active ? "#fff" : "#111827"};
    border:1.5px solid ${color};
    box-shadow:0 2px 8px rgba(0,0,0,.18);
    font-size:11.5px;font-weight:600;white-space:nowrap;cursor:pointer;
    transform:translateY(-2px);letter-spacing:-.2px;`;
  if (opts.pulse) el.classList.add("pulse");
  el.innerHTML = `<span style="font-size:13px">${emoji}</span><span>${label}</span>`;
  return el;
}

/** 넓게 볼 때 쓰는 점 마커 — 이름표 없이 위치와 종류만 알린다 */
function dotEl(color: string, emoji: string) {
  const el = document.createElement("div");
  el.style.cssText = `
    display:grid;place-items:center;width:20px;height:20px;border-radius:999px;
    background:rgba(255,255,255,0.97);border:2px solid ${color};
    box-shadow:0 1px 4px rgba(0,0,0,.2);font-size:10px;cursor:pointer;`;
  el.textContent = emoji;
  return el;
}

function speedEl(link: TrafficLink) {
  const color =
    link.level === "congested" ? "#dc2626" : link.level === "slow" ? "#f59e0b" : "#16a34a";
  const el = document.createElement("div");
  el.style.cssText = `
    padding:2px 7px;border-radius:6px;background:${color};color:#fff;
    font-size:11px;font-weight:700;box-shadow:0 2px 6px rgba(0,0,0,.25);white-space:nowrap;`;
  el.textContent = `${link.speed}km/h`;
  return el;
}

export interface KakaoMapProps {
  appKey?: string;
  center: { lat: number; lng: number };
  level: number;
  radius: number;
  places: Place[];
  incidents: Incident[];
  busStops: BusStop[];
  trafficLinks: TrafficLink[];
  /** 진료중인 병원·약국 (의료 모드) */
  medicalOpen: { id: string; name: string; kind: string; lat: number | null; lng: number | null }[];
  /** 랜드마크 (둘러보기 모드) */
  landmarks: { name: string; lat: number; lng: number; desc: string }[];
  /** 의왕시 행정경계 표시 */
  showBoundary: boolean;
  /** 강조할 행정동 이름 (null 이면 없음) */
  activeDong: string | null;
  /** 경계 바깥을 어둡게 덮어 시 영역을 강조 */
  dimOutside: boolean;
  selectedPlaceId: string | null;
  onSelectPlace: (p: Place) => void;
  onMapMoved: (c: { lat: number; lng: number }) => void;
}

export default function KakaoMap({
  appKey,
  center,
  level,
  radius,
  places,
  incidents,
  busStops,
  trafficLinks,
  medicalOpen,
  landmarks,
  showBoundary,
  activeDong,
  dimOutside,
  selectedPlaceId,
  onSelectPlace,
  onMapMoved,
}: KakaoMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<kakao.maps.Map | null>(null);
  const overlaysRef = useRef<kakao.maps.CustomOverlay[]>([]);
  const circleRef = useRef<kakao.maps.Circle | null>(null);
  const boundaryRef = useRef<kakao.maps.Polygon[]>([]);
  const dongRef = useRef<kakao.maps.Polygon[]>([]);
  const movedRef = useRef(onMapMoved);
  const [ready, setReady] = useState(false);
  const [sdkError, setSdkError] = useState<string | null>(null);

  const error = appKey
    ? sdkError
    : "NEXT_PUBLIC_KAKAO_JS_KEY 가 설정되지 않았습니다.";

  // ssr:false 로 동적 로드되는 컴포넌트라 렌더 중 window 접근이 안전하다
  const origin = typeof window !== "undefined" ? window.location.origin : "";

  // 최신 콜백을 ref 로 유지 — 지도 재생성 없이 dragend 핸들러가 최신 함수를 참조
  useEffect(() => {
    movedRef.current = onMapMoved;
  }, [onMapMoved]);

  // SDK 로드 + 지도 생성
  useEffect(() => {
    if (!appKey) return;
    let cancelled = false;
    loadSdk(appKey)
      .then(() => {
        if (cancelled || !containerRef.current || mapRef.current) return;
        const map = new window.kakao.maps.Map(containerRef.current, {
          center: new window.kakao.maps.LatLng(center.lat, center.lng),
          level,
        });
        mapRef.current = map;
        window.kakao.maps.event.addListener(map, "dragend", () => {
          const c = map.getCenter();
          movedRef.current({ lat: c.getLat(), lng: c.getLng() });
        });
        setReady(true);
      })
      .catch((e: Error) => setSdkError(e.message));
    return () => {
      cancelled = true;
    };
    // 최초 1회만 — center/level 변경은 아래 effect 가 처리
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appKey]);

  // 외부에서 center 변경 시 이동
  useEffect(() => {
    if (!ready || !mapRef.current) return;
    mapRef.current.panTo(new window.kakao.maps.LatLng(center.lat, center.lng));
  }, [ready, center.lat, center.lng]);

  useEffect(() => {
    if (!ready || !mapRef.current) return;
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
      strokeColor: "#0b6b5b",
      strokeOpacity: 0.95,
      strokeStyle: "solid",
      fillColor: "#0b6b5b",
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
      strokeColor: "#c026d3",
      strokeOpacity: 0.95,
      strokeStyle: "solid",
      fillColor: "#c026d3",
      fillOpacity: 0.12,
      // 시 경계(2)보다 위, 마커(10+)보다 아래
      zIndex: 5,
    });
    poly.setMap(map);
    dongRef.current.push(poly);
  }, [ready, activeDong]);

  // 검색 반경 원
  useEffect(() => {
    if (!ready || !mapRef.current) return;
    circleRef.current?.setMap(null);
    const circle = new window.kakao.maps.Circle({
      center: new window.kakao.maps.LatLng(center.lat, center.lng),
      radius,
      strokeWeight: 1.5,
      strokeColor: "#0b6b5b",
      strokeOpacity: 0.7,
      strokeStyle: "dash",
      fillColor: "#0b6b5b",
      fillOpacity: 0.05,
    });
    circle.setMap(mapRef.current);
    circleRef.current = circle;
  }, [ready, center.lat, center.lng, radius]);

  // 마커 동기화
  useEffect(() => {
    if (!ready || !mapRef.current) return;
    const map = mapRef.current;
    overlaysRef.current.forEach((o) => o.setMap(null));
    overlaysRef.current = [];

    const add = (
      lat: number,
      lng: number,
      el: HTMLElement,
      zIndex: number,
      onClick?: () => void,
    ) => {
      if (onClick) el.addEventListener("click", onClick);
      const ov = new window.kakao.maps.CustomOverlay({
        position: new window.kakao.maps.LatLng(lat, lng),
        content: el,
        yAnchor: 1,
        zIndex,
        clickable: true,
      });
      ov.setMap(map);
      overlaysRef.current.push(ov);
    };

    /**
     * 마커 밀도 조절.
     * 넓게 보면 이름표가 서로 겹쳐 읽을 수 없으므로 점으로만 찍고,
     * 가까이 들어오면 이름표를 붙인다. 개수도 화면 배율에 맞춰 제한한다.
     * (이전에는 340여 개를 전부 이름표로 그려 지도가 읽히지 않았다)
     */
    const labelled = level <= 4;
    const cap = level <= 3 ? 80 : level <= 5 ? 50 : 25;

    // 가까운 순으로 정렬돼 오므로 앞에서 자르면 중심 주변이 남는다
    const shownPlaces = places.slice(0, cap);
    for (const p of shownPlaces) {
      const def = CATEGORY_MAP[p.category];
      if (!def) continue;
      const active = selectedPlaceId === p.id;
      add(
        p.lat,
        p.lng,
        active || labelled
          ? pinEl(def.emoji, def.color, p.name, { active })
          : dotEl(def.color, def.emoji),
        active ? 90 : 10,
        () => onSelectPlace(p),
      );
    }

    // 진료중인 곳은 개수가 적고 중요도가 높아 항상 이름표를 붙인다
    for (const m of medicalOpen.slice(0, 40)) {
      if (m.lat == null || m.lng == null) continue;
      add(m.lat, m.lng, pinEl(m.kind === "pharmacy" ? "💊" : "🏥", "#059669", m.name), 60);
    }

    for (const l of landmarks) {
      add(l.lat, l.lng, pinEl("📍", "#7c3aed", l.name), 50);
    }

    for (const s of busStops.slice(0, 12)) {
      const next = s.arrivals?.[0]?.predictSec;
      const label =
        next != null ? `${s.name} · ${Math.max(1, Math.round(next / 60))}분` : s.name;
      add(s.lat, s.lng, labelled ? pinEl("🚌", "#1d4ed8", label) : dotEl("#1d4ed8", "🚌"), 20);
    }

    // 사고·통제는 건수가 적고 가장 중요하므로 항상 이름표 + 강조
    for (const inc of incidents) {
      if (inc.lat == null || inc.lng == null) continue;
      const st = INCIDENT_STYLE[inc.kind];
      add(
        inc.lat,
        inc.lng,
        pinEl(st.emoji, st.color, inc.type, { pulse: inc.kind === "accident" }),
        80,
      );
    }

    if (labelled) {
      for (const l of trafficLinks) {
        if (l.lat == null || l.lng == null) continue;
        add(l.lat, l.lng, speedEl(l), 30);
      }
    }
  }, [
    ready,
    level,
    places,
    busStops,
    incidents,
    trafficLinks,
    medicalOpen,
    landmarks,
    selectedPlaceId,
    onSelectPlace,
  ]);

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="h-full w-full" />
      {error && (
        <div className="absolute inset-0 grid place-items-center overflow-y-auto bg-[var(--surface-2)] p-6 text-center">
          <div className="max-w-md space-y-3">
            <div className="text-4xl">🗺️</div>
            <p className="font-semibold">지도를 표시할 수 없습니다</p>
            <p className="text-sm text-[var(--muted)]">{error}</p>
            <div className="rounded-lg bg-[var(--surface)] p-3 text-left text-xs leading-relaxed text-[var(--muted)]">
              {appKey ? (
                <>
                  <p className="mb-2">
                    키는 설정돼 있습니다. 카카오 개발자 콘솔에서 두 가지를 확인하세요.
                  </p>
                  <p className="mb-1.5">
                    <strong className="text-[var(--foreground)]">① 플랫폼 &gt; Web</strong> 에
                    현재 주소를 등록:
                    <br />
                    <code className="mt-1 inline-block rounded bg-[var(--surface-2)] px-1.5 py-0.5 break-all">
                      {origin || "현재 도메인"}
                    </code>
                  </p>
                  <p>
                    <strong className="text-[var(--foreground)]">② 제품 설정 &gt; 카카오맵</strong>{" "}
                    활성화 ON
                  </p>
                </>
              ) : (
                <p>
                  <code>NEXT_PUBLIC_KAKAO_JS_KEY</code> 가 설정되지 않았습니다. 로컬은{" "}
                  <code>.env.local</code>, 배포 환경은 호스팅 환경변수에 추가한 뒤 재시작(재배포)
                  하세요.
                </p>
              )}
              <p className="mt-2 border-t border-[var(--border)] pt-2">
                사이드 패널의 목록·실시간 정보는 지도 없이도 정상 동작합니다.
              </p>
            </div>
          </div>
        </div>
      )}
      {!ready && !error && (
        <div className="absolute inset-0 grid place-items-center bg-[var(--surface-2)]">
          <span className="text-sm text-[var(--muted)]">지도를 불러오는 중…</span>
        </div>
      )}
    </div>
  );
}
