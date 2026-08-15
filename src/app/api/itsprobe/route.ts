export const dynamic = "force-dynamic";

export async function GET() {
  const key = process.env.ITS_API_KEY;
  const bbox = "minX=126.919&maxX=127.057&minY=37.29&maxY=37.426";
  const targets: [string, string][] = [
    ["eventInfo(예전에 되던 것)", `https://openapi.its.go.kr:9443/eventInfo?apiKey=${key}&type=all&eventType=all&${bbox}&getType=json`],
    ["trafficInfo(전체)", `https://openapi.its.go.kr:9443/trafficInfo?apiKey=${key}&type=all&${bbox}&getType=json`],
    ["trafficInfo(좁게)", `https://openapi.its.go.kr:9443/trafficInfo?apiKey=${key}&type=all&minX=126.96&maxX=126.978&minY=37.336&maxY=37.352&getType=json`],
  ];
  const out: unknown[] = [{ region: process.env.VERCEL_REGION, keyLen: key?.length }];
  for (const [label, url] of targets) {
    const t0 = Date.now();
    try {
      const r = await fetch(url);
      const txt = await r.text();
      out.push({ label, ms: Date.now() - t0, status: r.status, head: txt.slice(0, 90) });
    } catch (e) {
      const err = e as Error & { cause?: { code?: string; message?: string } };
      out.push({
        label, ms: Date.now() - t0, error: err.message,
        cause: err.cause?.code ?? err.cause?.message ?? String(err.cause).slice(0, 120),
      });
    }
  }
  return Response.json(out, { headers: { "Cache-Control": "no-store" } });
}
