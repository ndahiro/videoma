import type { MetadataRoute } from "next";
import { WebsiteBaseUrl } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // The console and the API are session-gated; keep crawlers out.
        disallow: ["/api/", "/account", "/admin", "/dashboard", "/videos", "/search", "/query", "/summarize"],
      },
    ],
    sitemap: `${WebsiteBaseUrl.replace(/\/$/, "")}/sitemap.xml`,
  };
}
