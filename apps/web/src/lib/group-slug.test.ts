import { describe, expect, it } from "vitest";
import {
  createWorkspaceWithUniqueSlug,
  groupSlugFromName,
  isWorkspaceSlugTaken,
  randomSlugSuffix,
  transliterateGroupName,
} from "@/lib/group-slug";

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

describe("groupSlugFromName", () => {
  it("transliterates a Persian name and keeps a short unique suffix", () => {
    expect(transliterateGroupName("آفتاب")).toBe("aftab");
    expect(groupSlugFromName("آفتاب", "friends_family", "k7m2q")).toBe("friends-aftab-k7m2q");
    const family = transliterateGroupName("خانواده علی");
    expect(family.startsWith("khan")).toBe(true);
    expect(groupSlugFromName("خانواده علی", "household", "m3p8")).toBe(`family-${family}-m3p8`);
  });

  it("does not fall back to a clock stamp when the name has no latin letters", () => {
    const slug = groupSlugFromName("دوستان", "friends_family", "ab12c");
    expect(slug).toBe("friends-dvstan-ab12c");
    expect(slug).toMatch(SLUG);
    expect(slug.length).toBeLessThanOrEqual(48);
    expect(slug).not.toMatch(/\d{10,}/);
  });

  it("mints a different suffix for the same name", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 24; i += 1) {
      const slug = groupSlugFromName("هم‌خانه", "household");
      expect(slug).toMatch(SLUG);
      seen.add(slug);
    }
    expect(seen.size).toBe(24);
    expect(randomSlugSuffix()).toMatch(/^[a-z0-9]{5}$/);
  });
});

describe("createWorkspaceWithUniqueSlug", () => {
  it("retries when the first slug is already taken", async () => {
    let calls = 0;
    let n = 0;
    const result = await createWorkspaceWithUniqueSlug(
      { name: "آفتاب", template: "friends_family", ownerDefaultShares: 1 },
      async (body) => {
        calls += 1;
        if (calls === 1) {
          throw Object.assign(new Error("Workspace slug already exists"), { status: 409 });
        }
        return body;
      },
      {
        suffix: () => {
          n += 1;
          return `s${n}`;
        },
      },
    );
    expect(
      isWorkspaceSlugTaken(
        Object.assign(new Error("Workspace slug already exists"), { status: 409 }),
      ),
    ).toBe(true);
    expect(result.slug).toBe("friends-aftab-s2");
    expect(calls).toBe(2);
  });

  it("does not retry a conflict that is not a slug collision", async () => {
    await expect(
      createWorkspaceWithUniqueSlug(
        { name: "آفتاب", template: "friends_family", ownerDefaultShares: 1 },
        async () => {
          throw Object.assign(new Error("این ایمیل قبلاً ثبت شده است"), { status: 409 });
        },
        { attempts: 3, suffix: () => "s1" },
      ),
    ).rejects.toThrow("این ایمیل قبلاً ثبت شده است");
  });
});
