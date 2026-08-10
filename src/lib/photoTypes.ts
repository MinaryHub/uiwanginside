export interface Photo {
  id: number;
  url: string;
  caption: string | null;
  lat: number;
  lng: number;
  /** exif = 사진에 박힌 촬영 위치, device = 등록 당시 내 위치, manual = 지도에서 지정 */
  locSource: "exif" | "device" | "manual";
  takenAt: string | null;
  createdAt: string;
}

export interface PhotosPayload {
  photos: Photo[];
  updatedAt: string;
}
