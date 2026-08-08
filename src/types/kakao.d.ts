/* 카카오맵 JS SDK 최소 타입 선언 (실제 사용 API만) */

declare namespace kakao.maps {
  class LatLng {
    constructor(lat: number, lng: number);
    getLat(): number;
    getLng(): number;
  }
  class LatLngBounds {
    constructor();
    extend(latlng: LatLng): void;
    isEmpty(): boolean;
  }
  class Map {
    constructor(container: HTMLElement, options: { center: LatLng; level?: number });
    setCenter(latlng: LatLng): void;
    getCenter(): LatLng;
    setLevel(level: number, options?: { animate?: boolean }): void;
    getLevel(): number;
    panTo(latlng: LatLng): void;
    setBounds(bounds: LatLngBounds): void;
    relayout(): void;
  }
  class CustomOverlay {
    constructor(options: {
      position: LatLng;
      content: HTMLElement | string;
      map?: Map | null;
      yAnchor?: number;
      xAnchor?: number;
      zIndex?: number;
      clickable?: boolean;
    });
    setMap(map: Map | null): void;
    setPosition(latlng: LatLng): void;
  }
  class Circle {
    constructor(options: {
      center: LatLng;
      radius: number;
      strokeWeight?: number;
      strokeColor?: string;
      strokeOpacity?: number;
      strokeStyle?: string;
      fillColor?: string;
      fillOpacity?: number;
    });
    setMap(map: Map | null): void;
    setRadius(r: number): void;
    setPosition(latlng: LatLng): void;
  }
  namespace event {
    function addListener(target: unknown, type: string, handler: (...args: never[]) => void): void;
  }
  function load(callback: () => void): void;
}

interface Window {
  kakao: typeof kakao;
}
