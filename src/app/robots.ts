import type { MetadataRoute } from "next";

function siteOrigin(): string {
  const raw =
    process.env.PUBLIC_URL ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : "") ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "") ||
    "https://uiwanginside.vercel.app";
  return raw.replace(/\/+$/, "");
}

export default function robots(): MetadataRoute.Robots {
  const origin = siteOrigin();
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/opendata", "/status"],
        disallow: ["/api/", "/stats/"],
      },
    ],
    sitemap: `${origin}/sitemap.xml`,
    host: origin,
  };
}
