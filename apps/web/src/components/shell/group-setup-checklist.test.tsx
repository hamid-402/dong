/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { GroupSetupChecklist } from "./group-setup-checklist";

describe("GroupSetupChecklist", () => {
  afterEach(() => cleanup());

  it("owner sees mutate deep-links for pending steps", () => {
    render(
      <GroupSetupChecklist
        slug="demo"
        memberCount={1}
        financeManagerCount={1}
        postedCount={0}
        canManageMembers
        canAddExpense
      />,
    );
    const ctas = screen.getAllByRole("link", { name: "انجام ←" });
    const hrefs = ctas.map((el) => el.getAttribute("href") ?? "");
    expect(hrefs.some((h) => h.includes("#expense-panel"))).toBe(true);
    expect(hrefs.some((h) => h.includes("#member-add-panel"))).toBe(true);
  });

  it("guest/read-only sees مشاهده and no member-add / expense-panel anchors", () => {
    render(
      <GroupSetupChecklist
        slug="demo"
        memberCount={1}
        financeManagerCount={0}
        postedCount={0}
        canManageMembers={false}
        canAddExpense={false}
      />,
    );
    const links = screen.getAllByRole("link", { name: "مشاهده" });
    expect(links.length).toBeGreaterThanOrEqual(2);
    for (const link of links) {
      const href = link.getAttribute("href") ?? "";
      expect(href).not.toContain("#member-add-panel");
      expect(href).not.toContain("#expense-panel");
    }
    expect(screen.getByText(/منتظر دعوت از مدیر فضا/)).toBeTruthy();
  });
});
