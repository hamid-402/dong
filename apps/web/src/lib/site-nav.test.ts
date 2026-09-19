import { describe, expect, it } from "vitest";
import {
  SITE_CLIENT_SCENARIOS,
  SITE_FOOTER_ACCOUNT,
  SITE_FOOTER_PRODUCT,
  SITE_HEADER_NAV,
  SITE_SERVICE_ITEMS,
} from "@/lib/site-nav";

describe("site-nav", () => {
  it("exposes a complete public header without product tabs", () => {
    expect(SITE_HEADER_NAV.map((i) => i.href)).toEqual([
      "/",
      "/services",
      "/clients",
      "/about",
      "/contact",
    ]);
    expect(SITE_HEADER_NAV.some((i) => i.href.includes("expenses"))).toBe(false);
  });

  it("keeps footer destinations public-only", () => {
    const hrefs = [...SITE_FOOTER_PRODUCT, ...SITE_FOOTER_ACCOUNT].map((i) => i.href);
    expect(hrefs).toContain("/services");
    expect(hrefs).toContain("/contact");
    expect(hrefs).toContain("/login");
    expect(hrefs.every((h) => !h.startsWith("/w/"))).toBe(true);
  });

  it("lists honest scenarios without fake metrics", () => {
    expect(SITE_SERVICE_ITEMS.length).toBeGreaterThanOrEqual(3);
    expect(SITE_CLIENT_SCENARIOS.length).toBeGreaterThanOrEqual(3);
    for (const item of [...SITE_SERVICE_ITEMS, ...SITE_CLIENT_SCENARIOS]) {
      expect(item.body.length).toBeGreaterThan(12);
    }
  });
});
