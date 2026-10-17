/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { SpaceHomeOutingCard } from "./space-home-outing-card";

describe("SpaceHomeOutingCard", () => {
  afterEach(() => cleanup());

  it("renders nothing when there are no outings", () => {
    const { container } = render(
      <SpaceHomeOutingCard outings={[]} expensesHref="/w/g/expenses" />,
    );
    expect(container.textContent).toBe("");
  });

  it("lists outing links and space management link when data exists", () => {
    render(
      <SpaceHomeOutingCard
        outings={[
          { id: "o1", title: "جمعه", expenseIds: ["e1", "e2"] },
          { id: "o2", title: "سفر", expenseIds: [] },
        ]}
        expensesHref="/w/g/expenses"
        spaceHref="/w/g/space"
      />,
    );
    expect(screen.getByText(/گردش چندخرجی/)).toBeTruthy();
    const friday = screen.getByRole("link", { name: /جمعه/ });
    expect(friday.getAttribute("href")).toContain("outing=o1");
    expect(friday.getAttribute("href")).toContain("#quick-expense");
    expect(
      screen.getByRole("link", { name: /مدیریت و ساخت گردش/ }).getAttribute("href"),
    ).toBe("/w/g/space");
  });
});
