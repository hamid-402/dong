import { describe, expect, it } from "vitest";
import { siteMetadata } from "@/lib/site-meta";

describe("site-meta", () => {
  it("builds titled metadata with openGraph", () => {
    const meta = siteMetadata({
      title: "خدمات ما",
      description: "شرح",
      path: "/services",
    });
    expect(meta.title).toContain("خدمات ما");
    expect(meta.description).toBe("شرح");
    expect(meta.openGraph?.url).toBe("/services");
  });
});
