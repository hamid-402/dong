/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { FinanceOperationsHeader } from "./finance-operations-header";

describe("FinanceOperationsHeader", () => {
  afterEach(cleanup);

  it("renders only supplied runtime metrics and keeps canonical destinations", () => {
    const onRefresh = vi.fn();
    render(
      <FinanceOperationsHeader
        destinations={[
          { key: "expenses", label: "خرج‌ها", href: "/w/demo/expenses", active: true },
          { key: "settlements", label: "تسویه‌ها", href: "/w/demo/settlements", active: false },
        ]}
        metrics={[
          { label: "خرج ثبت‌شده", value: "۴", detail: "از API" },
          { label: "تسویه باز", value: "۲", tone: "attention" },
        ]}
        roleLabel="مدیر مالی"
        persistenceLabel="ذخیره‌سازی پایدار"
        pending={false}
        onRefresh={onRefresh}
      />,
    );

    expect(screen.getByRole("link", { name: "خرج‌ها" }).getAttribute("href")).toBe(
      "/w/demo/expenses",
    );
    expect(screen.getByRole("link", { name: "خرج‌ها" }).getAttribute("aria-current")).toBe(
      "page",
    );
    expect(screen.getByText("۴")).toBeTruthy();
    expect(screen.getByText("از API")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "تازه‌سازی" }));
    expect(onRefresh).toHaveBeenCalledOnce();
  });

  it("communicates pending refresh and prevents duplicate requests", () => {
    render(
      <FinanceOperationsHeader
        destinations={[]}
        metrics={[]}
        roleLabel={null}
        persistenceLabel="در حال بارگذاری…"
        pending
        onRefresh={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("button", { name: "در حال همگام‌سازی…" }),
    ).toBeDisabled();
  });
});
