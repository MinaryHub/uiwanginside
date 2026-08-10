/**
 * 공유 수신 전용 서비스워커.
 *
 * 폰 갤러리에서 "공유 → 의왕" 을 누르면 브라우저가 이 앱으로
 * multipart POST 를 보낸다. 받은 파일을 서버로 바로 넘길 수는 없다.
 * 등록에는 위치가 필요하고, 위치는 브라우저에서만 얻을 수 있기 때문이다.
 * 그래서 파일을 Cache Storage 에 잠시 두고 화면으로 넘긴다.
 *
 * 캐시나 오프라인 기능은 넣지 않았다. 실시간 정보를 다루는 앱이라
 * 오래된 응답을 되돌려주는 쪽이 더 위험하다.
 */
const SHARE_CACHE = "uiwang-share-v1";
const SHARE_KEY = "/__shared-photo__";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "POST" || url.pathname !== "/share") return;

  event.respondWith(
    (async () => {
      try {
        const form = await event.request.formData();
        const files = form.getAll("photos").filter((f) => f && f.size > 0);
        const cache = await caches.open(SHARE_CACHE);

        // 이전에 공유한 것이 남아 있으면 지운다
        for (const k of await cache.keys()) await cache.delete(k);

        for (const [i, file] of files.entries()) {
          await cache.put(
            new Request(`${SHARE_KEY}/${i}`),
            new Response(file, {
              headers: {
                "Content-Type": file.type || "image/jpeg",
                "X-File-Name": encodeURIComponent(file.name || `shared-${i}.jpg`),
              },
            }),
          );
        }
        return Response.redirect(`/share?n=${files.length}`, 303);
      } catch {
        return Response.redirect("/share?error=1", 303);
      }
    })(),
  );
});
