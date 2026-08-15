export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  const url = new URL(req.url).searchParams.get("u");
  const out: unknown[] = [{ region: process.env.VERCEL_REGION }];
  for (const [label, target] of [
    ["ITS 목록", `https://openapi.its.go.kr:9443/cctvInfo?apiKey=${process.env.ITS_API_KEY}&type=all&cctvType=3&minX=126.95&maxX=126.97&minY=37.31&maxY=37.33&getType=json`],
    ["영상 서버", url ?? ""],
  ] as [string, string][]) {
    if (!target) { out.push({ label, skipped: true }); continue; }
    const t0 = Date.now();
    try {
      const r = await fetch(target);
      out.push({ label, ms: Date.now() - t0, status: r.status, type: r.headers.get("content-type") });
    } catch (e) {
      const err = e as Error & { cause?: { code?: string } };
      out.push({ label, ms: Date.now() - t0, error: err.message, cause: err.cause?.code });
    }
  }
  return Response.json(out, { headers: { "Cache-Control": "no-store" } });
}
