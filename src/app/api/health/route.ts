import { runHealthChecks, resolvePublicOrigin, type HealthCheck } from "@/lib/health";

export const dynamic = "force-dynamic";
export const maxDuration = 25;

export type { HealthCheck };

export async function GET(req: Request) {
  const origin = resolvePublicOrigin(req.headers, req.url);
  const report = await runHealthChecks(origin);
  return Response.json(report, { headers: { "Cache-Control": "no-store" } });
}
