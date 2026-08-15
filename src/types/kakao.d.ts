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
    getSouthWest(): LatLng;
    getNorthEast(): LatLng;
  }
  class Map {
    constructor(container: HTMLElement, options: { center: LatLng; level?: number });
    setCenter(latlng: LatLng): void;
    getCenter(): LatLng;
    setLevel(level: number, options?: { animate?: boolean }): void;
    getLevel(): number;
    getBounds(): LatLngBounds;
    panTo(latlng: LatLng): void;
    /** padding 은 상·우·하·좌 순서 (px) */
    setBounds(
      bounds: LatLngBounds,
      paddingTop?: number,
      paddingRight?: number,
      paddingBottom?: number,
      paddingLeft?: number,
    ): void;
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
    /** 오버레이를 지웠다 만들지 않고 내용만 갈아 끼운다 */
    setContent(content: HTMLElement | string): void;
    setZIndex(zIndex: number): void;
  }
  class Polygon {
    /** path 가 LatLng[][] 이면 첫 배열이 외곽, 이후 배열은 구멍(hole)이다 */
    constructor(options: {
      path: LatLng[] | LatLng[][];
      strokeWeight?: number;
      strokeColor?: string;
      strokeOpacity?: number;
      strokeStyle?: string;
      fillColor?: string;
      fillOpacity?: number;
      zIndex?: number;
    });
    setMap(map: Map | null): void;
  }
  class Polyline {
    constructor(options: {
      path: LatLng[];
      strokeWeight?: number;
      strokeColor?: string;
      strokeOpacity?: number;
      strokeStyle?: string;
      zIndex?: number;
    });
    setMap(map: Map | null): void;
    /** 색만 바꿀 때 쓴다. 지웠다 다시 만들면 깜빡인다. */
    setOptions(options: {
      strokeWeight?: number;
      strokeColor?: string;
      strokeOpacity?: number;
      zIndex?: number;
    }): void;
  }
  namespace event {
    function addListener(target: unknown, type: string, handler: (...args: never[]) => void): void;
  }
  function load(callback: () => void): void;
}

interface Window {
  kakao: typeof kakao;
}
