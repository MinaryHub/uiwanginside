/**
 * 카카오맵 SDK 대신 Leaflet + OpenStreetMap 타일.
 *
 * 카카오맵은 JavaScript 키와 도메인 등록이 있어야 그려진다. 배포 주소가
 * 바뀌거나(파이·Vercel) 키가 빠지면 지도 자리가 통째로 비었다. 공개 타일은
 * 키도 도메인 등록도 없이 어디서나 뜬다.
 *
 * 지도 컴포넌트(KakaoMap.tsx)는 카카오 API 모양 그대로 둔다. 마커·버스
 * 애니메이션·경계선 코드가 그 위에 쌓여 있어, 그것을 다 고쳐 쓰는 대신
 * 쓰는 만큼(src/types/kakao.d.ts 에 적힌 것)만 Leaflet 으로 흉내 낸다.
 *
 * 확대 수준: 카카오 level 은 작을수록 가깝고(1~14), Leaflet zoom 은 클수록
 * 가깝다. level 3 ≈ zoom 17 이 흔히 쓰는 대응이라 zoom = 20 − level 로 둔다.
 */
import type * as Leaflet from "leaflet";

type L = typeof Leaflet;

/**
 * 지도 그림. NEXT_PUBLIC_MAP_TILES 로 바꿀 수 있다 (osm | 타일 URL).
 *
 * 기본은 OpenStreetMap 기본 지도. 키가 없고, 한국에서는 이름이 한글로 나온다.
 * 이용 조건은 저작권 표시와 과하지 않은 사용이다 (OSMF 타일 이용 정책).
 *
 * CARTO 는 쓰지 않는다. 2026-11 기준 키 없이 부르면 "API KEY REQUIRED"
 * 워터마크가 타일마다 찍혀 나왔다 — 실제 배포에서 겪었다.
 */
export function tileSpec(choice = process.env.NEXT_PUBLIC_MAP_TILES ?? "osm") {
  if (choice.startsWith("http")) {
    return {
      url: choice,
      subdomains: "abc",
      maxNativeZoom: 19,
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    };
  }
  return {
    url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    subdomains: "",
    maxNativeZoom: 19,
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  };
}

const MIN_ZOOM = 8;
const MAX_ZOOM = 19;
const toZoom = (level: number) => Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, 20 - level));
const toLevel = (zoom: number) => Math.round(20 - zoom);

/** 겹침 순서. Leaflet 기본 도형 칸(400)과 마커 칸(600) 사이에 둔다 */
function paneFor(map: Leaflet.Map, z: number): string {
  const name = `kz${Math.max(0, Math.min(99, Math.round(z)))}`;
  if (!map.getPane(name)) {
    const p = map.createPane(name);
    p.style.zIndex = String(400 + Math.max(0, Math.min(99, Math.round(z))));
    // 도형은 누를 것이 아니다. 아래 지도를 끄는 데 방해가 되지 않게
    p.style.pointerEvents = "none";
  }
  return name;
}

export function installKakaoShim(L: L): void {
  class LatLng {
    constructor(
      public lat: number,
      public lng: number,
    ) {}
    getLat() {
      return this.lat;
    }
    getLng() {
      return this.lng;
    }
  }
  const toL = (p: LatLng) => L.latLng(p.lat, p.lng);
  const fromL = (p: Leaflet.LatLng) => new LatLng(p.lat, p.lng);

  class LatLngBounds {
    sw: LatLng | null = null;
    ne: LatLng | null = null;
    constructor(sw?: LatLng, ne?: LatLng) {
      if (sw) this.extend(sw);
      if (ne) this.extend(ne);
    }
    extend(p: LatLng) {
      if (!this.sw || !this.ne) {
        this.sw = new LatLng(p.lat, p.lng);
        this.ne = new LatLng(p.lat, p.lng);
        return;
      }
      this.sw = new LatLng(Math.min(this.sw.lat, p.lat), Math.min(this.sw.lng, p.lng));
      this.ne = new LatLng(Math.max(this.ne.lat, p.lat), Math.max(this.ne.lng, p.lng));
    }
    isEmpty() {
      return !this.sw;
    }
    getSouthWest() {
      return this.sw ?? new LatLng(0, 0);
    }
    getNorthEast() {
      return this.ne ?? new LatLng(0, 0);
    }
  }

  class KMap {
    /** 진짜 Leaflet 지도 — 도형·마커가 여기에 붙는다 */
    l: Leaflet.Map;
    constructor(container: HTMLElement, opts: { center: LatLng; level?: number }) {
      this.l = L.map(container, {
        center: toL(opts.center),
        zoom: toZoom(opts.level ?? 7),
        minZoom: MIN_ZOOM,
        maxZoom: MAX_ZOOM,
        // 확대·축소 단추는 화면에 따로 있다
        zoomControl: false,
        attributionControl: true,
        zoomSnap: 1,
      });
      const t = tileSpec();
      L.tileLayer(t.url, {
        // 비어 있으면 아예 넘기지 않는다. undefined 를 넘기면 Leaflet 의 기본값을
        // 덮어써, 타일 주소를 만들 때 subdomains.length 에서 죽는다 (OSM 이 그랬다)
        ...(t.subdomains ? { subdomains: t.subdomains } : {}),
        maxNativeZoom: t.maxNativeZoom,
        maxZoom: MAX_ZOOM,
        attribution: t.attribution,
        detectRetina: false,
      }).addTo(this.l);
      // 지도 저작권 표시 앞에 붙는 Leaflet 깃발은 뺀다 (Leaflet 은 BSD, 표기 의무 없음)
      this.l.attributionControl.setPrefix(false);
    }
    setCenter(p: LatLng) {
      this.l.setView(toL(p), this.l.getZoom(), { animate: false });
    }
    getCenter() {
      return fromL(this.l.getCenter());
    }
    setLevel(level: number, o?: { animate?: boolean }) {
      this.l.setZoom(toZoom(level), { animate: o?.animate ?? false });
    }
    getLevel() {
      return toLevel(this.l.getZoom());
    }
    getBounds() {
      const b = this.l.getBounds();
      return new LatLngBounds(fromL(b.getSouthWest()), fromL(b.getNorthEast()));
    }
    panTo(p: LatLng) {
      this.l.panTo(toL(p));
    }
    /** 여백은 상·우·하·좌 (px) — 카카오와 같은 순서 */
    setBounds(b: LatLngBounds, top = 0, right = 0, bottom = 0, left = 0) {
      if (b.isEmpty()) return;
      // 애니메이션 없이 — 부른 쪽이 바로 다음 줄에서 새 중심·확대 수준을 읽는다
      this.l.fitBounds(L.latLngBounds(toL(b.getSouthWest()), toL(b.getNorthEast())), {
        paddingTopLeft: [left, top],
        paddingBottomRight: [right, bottom],
        animate: false,
      });
    }
    relayout() {
      this.l.invalidateSize();
    }
  }

  /**
   * HTML 요소를 지도 위 한 점에 붙인다.
   * 크기 0 인 아이콘을 그 점에 두고, 안쪽 상자를 anchor 만큼 끌어 올린다 —
   * 카카오처럼 yAnchor 1 이면 내용의 아래 가운데가 그 점에 닿는다.
   */
  class CustomOverlay {
    private marker: Leaflet.Marker;
    private box: HTMLDivElement;
    private content: HTMLElement | string;
    private map: KMap | null = null;
    constructor(o: {
      position: LatLng;
      content: HTMLElement | string;
      map?: KMap | null;
      yAnchor?: number;
      xAnchor?: number;
      zIndex?: number;
      clickable?: boolean;
    }) {
      this.box = document.createElement("div");
      const xa = o.xAnchor ?? 0.5;
      const ya = o.yAnchor ?? 0.5;
      this.box.style.cssText = `position:absolute;left:0;top:0;transform:translate(${-xa * 100}%,${-ya * 100}%);white-space:nowrap;`;
      this.content = o.content;
      this.fill();
      this.marker = L.marker(toL(o.position), {
        icon: L.divIcon({ html: this.box, className: "kk-overlay", iconSize: [0, 0] }),
        interactive: o.clickable !== false,
        keyboard: false,
        zIndexOffset: (o.zIndex ?? 0) * 10_000,
      });
      if (o.map) this.setMap(o.map);
    }
    private fill() {
      this.box.replaceChildren();
      if (typeof this.content === "string") this.box.innerHTML = this.content;
      else this.box.appendChild(this.content);
    }
    setMap(map: KMap | null) {
      if (map === this.map) return;
      if (this.map) this.marker.remove();
      this.map = map;
      if (map) this.marker.addTo(map.l);
    }
    setPosition(p: LatLng) {
      this.marker.setLatLng(toL(p));
    }
    getContent() {
      return this.content;
    }
    setContent(c: HTMLElement | string) {
      this.content = c;
      this.fill();
    }
    setZIndex(z: number) {
      this.marker.setZIndexOffset(z * 10_000);
    }
  }

  interface StrokeOpts {
    strokeWeight?: number;
    strokeColor?: string;
    strokeOpacity?: number;
    strokeStyle?: string;
    fillColor?: string;
    fillOpacity?: number;
    zIndex?: number;
  }
  const style = (o: StrokeOpts): Leaflet.PathOptions => ({
    ...(o.strokeWeight !== undefined && { weight: o.strokeWeight, stroke: o.strokeWeight > 0 }),
    ...(o.strokeColor !== undefined && { color: o.strokeColor }),
    ...(o.strokeOpacity !== undefined && { opacity: o.strokeOpacity }),
    ...(o.strokeStyle === "dash" || o.strokeStyle === "shortdash" ? { dashArray: "6 6" } : {}),
    ...(o.fillColor !== undefined && { fillColor: o.fillColor }),
    ...(o.fillOpacity !== undefined && { fillOpacity: o.fillOpacity, fill: o.fillOpacity > 0 }),
  });

  /** 도형 공통 — 지도에 붙일 때 겹침 칸(pane)을 정한다 */
  class Shape {
    protected layer: Leaflet.Path | null = null;
    constructor(
      private make: (pane: string, o: StrokeOpts) => Leaflet.Path,
      protected opts: StrokeOpts,
    ) {}
    setMap(map: KMap | null) {
      if (this.layer) this.layer.remove();
      this.layer = map ? this.make(paneFor(map.l, this.opts.zIndex ?? 0), this.opts).addTo(map.l) : null;
    }
    /** 색만 바꿀 때 쓴다. 지웠다 다시 만들면 깜빡인다 */
    setOptions(o: StrokeOpts) {
      this.opts = { ...this.opts, ...o };
      this.layer?.setStyle(style(this.opts));
    }
  }

  class Polygon extends Shape {
    constructor(o: StrokeOpts & { path: LatLng[] | LatLng[][] }) {
      // 경로가 여럿이면 첫째가 바깥, 나머지가 구멍 — Leaflet 도 같은 규칙이다
      const rings = Array.isArray(o.path[0]) ? (o.path as LatLng[][]) : [o.path as LatLng[]];
      const latlngs = rings.map((r) => r.map(toL));
      super(
        (pane, so) =>
          L.polygon(latlngs, { pane, interactive: false, fill: true, stroke: true, ...style(so) }),
        o,
      );
    }
  }

  class Polyline extends Shape {
    constructor(o: StrokeOpts & { path: LatLng[] }) {
      const latlngs = o.path.map(toL);
      super((pane, so) => L.polyline(latlngs, { pane, interactive: false, ...style(so) }), o);
    }
  }

  const event = {
    addListener(target: unknown, type: string, handler: () => void) {
      // 카카오의 idle = 끌기·확대·축소·범위 맞춤이 끝난 뒤. Leaflet 의 moveend 가 같다
      if (target instanceof KMap && type === "idle") target.l.on("moveend", handler);
    },
  };

  (window as unknown as { kakao: unknown }).kakao = {
    maps: {
      LatLng,
      LatLngBounds,
      Map: KMap,
      CustomOverlay,
      Polygon,
      Polyline,
      event,
      load: (cb: () => void) => cb(),
    },
  };
}
