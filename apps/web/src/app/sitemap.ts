import type { MetadataRoute } from "next";

const BASE = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3005";

export default function sitemap(): MetadataRoute.Sitemap {
  const paths = ["", "/services", "/clients", "/about", "/contact", "/login", "/register"];
  const now = new Date();
  return paths.map((path) => ({
    url: `${BASE}${path || "/"}`,
    lastModified: now,
    changeFrequency: path === "" ? "weekly" : "monthly",
    priority: path === "" ? 1 : 0.7,
  }));
}
