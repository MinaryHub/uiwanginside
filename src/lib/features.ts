/**
 * 화면에서 감춘 기능.
 *
 * 주소와 API 는 그대로 둔다. 이미 올려둔 사진과, 남에게 보낸 리스트 공유
 * 링크가 죽지 않게 하기 위해서다 — 받은 사람 쪽에서 갑자기 404 가 되는 것은
 * 감추는 것이 아니라 망가뜨리는 것이다.
 *
 * 그래서 주소를 아는 사람은 여전히 쓸 수 있다. 완전히 막으려면 각 라우트에서
 * 따로 걸어야 한다.
 *
 * 되돌리려면 여기서 true 로 바꾸면 된다.
 */

/** 사진 올리기·내 사진첩·지도 위 사진 배지·폰에서 공유받아 등록 */
export const SHOW_PHOTOS = false;

/** 헤더의 "현재 화면 공유" 버튼 */
export const SHOW_MAP_SHARE = false;

/** 장소 리스트를 링크로 공유하기 (리스트 자체는 그대로 쓴다) */
export const SHOW_LIST_SHARE = false;

/** 사진을 감추면 로그인 뒤 갈 곳도 달라진다 */
export const AFTER_LOGIN = SHOW_PHOTOS ? "/gallery" : "/lists";
