import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: ["/", "/services", "/clients", "/about", "/contact", "/login", "/register"],
      disallow: ["/w/", "/account/", "/admin/", "/api/", "/hub/", "/spaces/"],
    },
  };
}
