export interface Cctv {
  /** 이름·좌표에서 만든 고정 id. 목록을 다시 받아도 같은 값이 나온다. */
  id: string;
  /** 카메라 이름 ("청계요금소") */
  name: string;
  /** 노선 ("수도권제1순환선") */
  road: string;
  lat: number;
  lng: number;
}

export interface CctvPayload {
  cameras: Cctv[];
  updatedAt: string;
}
