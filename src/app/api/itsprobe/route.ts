export const dynamic = "force-dynamic";
import { cityTiles } from "@/lib/traffic";

export async function GET() {
  const key = process.env.ITS_API_KEY;
  if (!key) return Response.json({ err: "no key" });
  const tiles = cityTiles();
  const url = (t: (typeof tiles)[number]) =>
    `https://openapi.its.go.kr:9443/trafficInfo?apiKey=${key}&type=all` +
    `&minX=${t.minX}&maxX=${t.maxX}&minY=${t.minY}&maxY=${t.maxY}&getType=json`;

  const batch = async (n: number) => {
    const t0 = Date.now();
    const rs = await Promise.all(
      tiles.slice(0, n).map(async (t) => {
        try {
          const r = await fetch(url(t));
          const j = await r.json();
          return `ok:${j?.body?.items?.length ?? 0}`;
        } catch (e) {
          return `ERR:${e instanceof Error ? e.message : e}`;
        }
      }),
    );
    const bad = rs.filter((x) => x.startsWith("ERR"));
    return `${n}개 병렬: ${Date.now() - t0}ms · 실패 ${bad.length} ${bad[0] ?? ""}`;
  };

  const out = [`칸 ${tiles.length}개`];
  for (const n of [1, 4, 8, 15]) out.push(await batch(n));
  return Response.json(out, { headers: { "Cache-Control": "no-store" } });
}
