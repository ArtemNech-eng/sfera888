import type { MetadataRoute } from "next";
import { publicUrl } from "../lib/env";

export default function robots(): MetadataRoute.Robots {
  const base = publicUrl();
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/"],
        disallow: ["/api/", "/zayavka/spasibo"],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
    host: new URL(base).host,
  };
}
