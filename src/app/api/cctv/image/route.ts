import { timedFetch } from "@/lib/fetcher";
import { fetchCctv } from "@/lib/cctv";

export const dynamic = "force-dynamic";

/**
 * CCTV 정지영상 중계.
 *
 * 원본은 http 로만 열려 https 페이지에서 브라우저가 막는다. 서버가
 * 대신 받아 넘긴다.
 *
 * 받는 것은 id 뿐이다. 주소를 받아 그대로 열어주면 남의 서버를 우리
 * 이름으로 두드리는 통로가 된다. id 는 우리가 만든 목록에 있어야만
 * 하고, 없으면 404 다.
 */
export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return new Response("id required", { status: 400 });

  try {
    const cam = (await fetchCctv()).find((c) => c.id === id);
    if (!cam) return new Response("not found", { status: 404 });

    const res = await timedFetch(cam.url, {}, 10_000);
    if (!res.ok || !res.body) return new Response("upstream error", { status: 502 });

    const type = res.headers.get("content-type") ?? "";
    // 이미지가 아니면 내보내지 않는다 — 카메라가 죽으면 오류 페이지가 온다
    if (!type.startsWith("image/")) return new Response("not an image", { status: 502 });

    return new Response(res.body, {
      headers: {
        "Content-Type": type,
        // 몇 초 사이 여러 사람이 같은 카메라를 봐도 원본은 한 번만 두드린다
        "Cache-Control": "public, max-age=0, s-maxage=10, stale-while-revalidate=20",
      },
    });
  } catch (e) {
    console.error("[cctv:image]", e);
    return new Response("fetch failed", { status: 502 });
  }
}
