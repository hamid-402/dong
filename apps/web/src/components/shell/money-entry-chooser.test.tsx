/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MoneyEntryChooser } from "./money-entry-chooser";

vi.mock("@/lib/use-app-chrome", () => ({
  useAppChrome: () => ({
    workspaceId: "ws-1",
    workspaces: [
      {
        id: "ws-1",
        slug: "demo",
        name: "Demo",
        template: "friends_family",
      },
    ],
  }),
}));

vi.mock("@/lib/use-workspace-membership-role", () => ({
  useWorkspaceMembershipRole: () => ({ role: "member", ready: true }),
}));

describe("MoneyEntryChooser", () => {
  afterEach(cleanup);

  it("offers daily entry and full expense jobs", () => {
    render(<MoneyEntryChooser slug="demo" />);
    expect(screen.getByRole("link", { name: /ثبت روزانه/ })).toHaveAttribute(
      "href",
      "/w/demo/ledger",
    );
    expect(screen.getByRole("link", { name: /خرج کامل/ })).toHaveAttribute(
      "href",
      "/w/demo/expenses#quick-expense",
    );
  });
});
