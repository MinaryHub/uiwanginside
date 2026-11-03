/**
 * 서비스워커 정리용.
 *
 * 예전에는 폰 갤러리에서 사진을 공유받으려고 서비스워커를 두었다. 사진
 * 기능을 없애면서 서비스워커도 필요 없어졌다. 다만 이미 설치된 브라우저는
 * 이 파일을 다시 받아 갱신을 확인하므로, 파일을 지우는 대신 스스로 등록을
 * 풀고 끝나게 둔다. 404 가 나면 예전 워커가 그대로 남는다.
 */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const k of await caches.keys()) await caches.delete(k);
      await self.registration.unregister();
    })(),
  );
});
