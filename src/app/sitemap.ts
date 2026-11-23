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

export default function sitemap(): MetadataRoute.Sitemap {
  const origin = siteOrigin();
  const now = new Date();
  return [
    {
      url: `${origin}/`,
      lastModified: now,
      changeFrequency: "hourly",
      priority: 1,
    },
    {
      url: `${origin}/opendata`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.7,
    },
    {
      url: `${origin}/status`,
      lastModified: now,
      changeFrequency: "daily",
      priority: 0.4,
    },
  ];
}
