"use client";

import { useEffect, useRef, useState } from "react";
import { CATEGORY_MAP } from "@/lib/uiwang";
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
    script.onerror = () => reject(new Error("카카오맵 SDK 로드 실패"));
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
  showIncidents: boolean;
  showBus: boolean;
  showTraffic: boolean;
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
  showIncidents,
  showBus,
  showTraffic,
  selectedPlaceId,
  onSelectPlace,
  onMapMoved,
}: KakaoMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<kakao.maps.Map | null>(null);
  const overlaysRef = useRef<kakao.maps.CustomOverlay[]>([]);
  const circleRef = useRef<kakao.maps.Circle | null>(null);
  const movedRef = useRef(onMapMoved);
  const [ready, setReady] = useState(false);
  const [sdkError, setSdkError] = useState<string | null>(null);

  const error = appKey
    ? sdkError
    : "NEXT_PUBLIC_KAKAO_JS_KEY 가 설정되지 않았습니다.";

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

    for (const p of places) {
      const def = CATEGORY_MAP[p.category];
      if (!def) continue;
      const active = selectedPlaceId === p.id;
      add(
        p.lat,
        p.lng,
        pinEl(def.emoji, def.color, p.name, { active }),
        active ? 90 : 10,
        () => onSelectPlace(p),
      );
    }

    if (showBus) {
      for (const s of busStops) {
        const next = s.arrivals?.[0]?.predictSec;
        const label =
          next != null ? `${s.name} · ${Math.max(1, Math.round(next / 60))}분` : s.name;
        add(s.lat, s.lng, pinEl("🚌", "#1d4ed8", label), 20);
      }
    }

    if (showIncidents) {
      for (const inc of incidents) {
        if (inc.lat == null || inc.lng == null) continue;
        const st = INCIDENT_STYLE[inc.kind];
        add(inc.lat, inc.lng, pinEl(st.emoji, st.color, inc.type, { pulse: inc.kind === "accident" }), 80);
      }
    }

    if (showTraffic) {
      for (const l of trafficLinks) {
        if (l.lat == null || l.lng == null) continue;
        add(l.lat, l.lng, speedEl(l), 30);
      }
    }
  }, [
    ready,
    places,
    busStops,
    incidents,
    trafficLinks,
    showBus,
    showIncidents,
    showTraffic,
    selectedPlaceId,
    onSelectPlace,
  ]);

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="h-full w-full" />
      {error && (
        <div className="absolute inset-0 grid place-items-center bg-[var(--surface-2)] p-6 text-center">
          <div className="max-w-md space-y-3">
            <div className="text-4xl">🗺️</div>
            <p className="font-semibold">지도를 표시할 수 없습니다</p>
            <p className="text-sm text-[var(--muted)]">{error}</p>
            <p className="rounded-lg bg-[var(--surface)] p-3 text-left text-xs leading-relaxed text-[var(--muted)]">
              <code>.env.local</code> 에 <code>NEXT_PUBLIC_KAKAO_JS_KEY</code> 를 추가하고
              카카오 개발자 콘솔 &gt; 앱 설정 &gt; 플랫폼 &gt; Web 에{" "}
              <code>http://localhost:3000</code> 을 등록하세요. 사이드 패널의 목록/실시간
              정보는 지도 없이도 동작합니다.
            </p>
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
