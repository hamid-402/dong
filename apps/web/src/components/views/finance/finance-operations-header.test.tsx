/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { FinanceOperationsHeader } from "./finance-operations-header";

describe("FinanceOperationsHeader", () => {
  afterEach(cleanup);

  it("renders live title, metrics, and refresh from props", () => {
    const onRefresh = vi.fn();
    render(
      <FinanceOperationsHeader
        destinations={[
          { key: "expenses", label: "خرج‌ها", href: "/w/demo/expenses", active: true },
          { key: "settlements", label: "تسویه‌ها", href: "/w/demo/settlements", active: false },
        ]}
        metrics={[{ label: "مانده", value: "۱٬۰۰۰", detail: "از API" }]}
        roleLabel="مالک"
        persistenceLabel="postgres"
        pending={false}
        onRefresh={onRefresh}
      />,
    );
    expect(screen.getByRole("heading", { level: 1, name: "خرج‌ها" })).toBeTruthy();
    expect(screen.getByText("مانده")).toBeTruthy();
    expect(screen.getByText("۱٬۰۰۰")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "تازه‌سازی" }));
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });
});
