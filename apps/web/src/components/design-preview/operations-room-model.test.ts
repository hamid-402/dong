import { describe, expect, it } from "vitest";
import { classicPathToWorkspacePage } from "@/lib/workspace-paths";
import {
  PREVIEW_ALIASES,
  PREVIEW_ROLES,
  PREVIEW_SCREENS,
  PREVIEW_TEMPLATES,
  getPreviewScreen,
  previewAccess,
  previewHref,
  visiblePreviewScreens,
} from "./operations-room-model";

describe("operations room preview model", () => {
  it("covers all 31 unique canonical screens", () => {
    expect(PREVIEW_SCREENS).toHaveLength(31);
    expect(new Set(PREVIEW_SCREENS.map((screen) => screen.id)).size).toBe(31);
    for (const screen of PREVIEW_SCREENS) {
      expect(previewHref(screen.id)).toBe(
        `/design-preview/operations-room/${screen.id}`,
      );
      expect(screen.title.length).toBeGreaterThan(1);
      expect(screen.summary.length).toBeGreaterThan(8);
    }
  });

  it("maps every compatibility alias to a canonical screen", () => {
    const ids = new Set(PREVIEW_SCREENS.map((screen) => screen.id));
    expect(Object.keys(PREVIEW_ALIASES)).toHaveLength(18);
    for (const target of Object.values(PREVIEW_ALIASES)) {
      expect(ids.has(target)).toBe(true);
    }
  });

  it("maps classic path aliases consistently with preview compatibility keys", () => {
    for (const [alias, screenId] of Object.entries(PREVIEW_ALIASES)) {
      const hashIndex = alias.indexOf("#");
      const path = hashIndex >= 0 ? alias.slice(0, hashIndex) : alias;
      const hash = hashIndex >= 0 ? alias.slice(hashIndex) : "";
      const page = classicPathToWorkspacePage(path, hash);
      expect(page).not.toBeNull();
      if (screenId === "workspace-home") expect(page).toBe("home");
      else if (screenId === "workspace-space") expect(page).toBe("space");
      else if (screenId === "account") expect(page).toBe("account");
      else if (screenId === "spaces-new") expect(page).toBe("spaces-new");
      else if (screenId === "org-finance") expect(page).toBe("orgFinance");
      else expect(page).toBe(screenId);
    }
  });

  it("covers all nine roles and six workspace templates", () => {
    expect(PREVIEW_ROLES).toHaveLength(9);
    expect(PREVIEW_TEMPLATES).toHaveLength(6);
  });

  it("enforces specialized, read-only, template, flag, and MFA states", () => {
    const base = {
      role: "owner" as const,
      template: "small_team" as const,
      flagMode: "full" as const,
      mfa: "enrolled" as const,
    };

    expect(previewAccess(getPreviewScreen("members"), base).writable).toBe(true);
    expect(
      previewAccess(getPreviewScreen("members"), {
        ...base,
        role: "member",
      }).writable,
    ).toBe(false);
    expect(
      previewAccess(getPreviewScreen("expenses"), {
        ...base,
        role: "auditor",
      }).reason,
    ).toBe("فقط مشاهده");
    expect(
      previewAccess(getPreviewScreen("procurement"), {
        ...base,
        template: "personal",
      }).visible,
    ).toBe(false);
    expect(
      previewAccess(getPreviewScreen("approvals"), {
        ...base,
        flagMode: "core",
      }).visible,
    ).toBe(false);
    expect(
      previewAccess(getPreviewScreen("org-finance"), {
        ...base,
        mfa: "required",
      }).needsMfa,
    ).toBe(true);
  });

  it("filters hidden destinations from the active navigation", () => {
    const screens = visiblePreviewScreens({
      role: "guest",
      template: "personal",
      flagMode: "core",
      mfa: "required",
    });
    const ids = new Set(screens.map((screen) => screen.id));

    expect(ids.has("expenses")).toBe(true);
    expect(ids.has("procurement")).toBe(false);
    expect(ids.has("approvals")).toBe(false);
    expect(ids.has("org-finance")).toBe(false);
  });
});
