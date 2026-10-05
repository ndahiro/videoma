import type { MetadataRoute } from "next";
import { WebsiteBaseUrl } from "@/lib/site";

/** Public URLs only — the console sits behind the session gate. */
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const paths = ["", "/pricing", "/contact", "/terms", "/privacy", "/login", "/register"];

  return paths.map((path) => ({
    url: `${WebsiteBaseUrl.replace(/\/$/, "")}${path}`,
    lastModified: now,
    changeFrequency: path === "" ? "weekly" : "monthly",
    priority: path === "" ? 1 : path === "/pricing" ? 0.9 : 0.6,
  }));
}
