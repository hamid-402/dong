/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { FinanceOperationsHeader } from "./finance-operations-header";

describe("FinanceOperationsHeader", () => {
  afterEach(cleanup);

  it("renders nothing — sibling ops strip retired", () => {
    const onRefresh = vi.fn();
    const { container } = render(
      <FinanceOperationsHeader
        destinations={[
          { key: "expenses", label: "خرج‌ها", href: "/w/demo/expenses", active: true },
          { key: "settlements", label: "تسویه‌ها", href: "/w/demo/settlements", active: false },
        ]}
        metrics={[
          { label: "مانده", value: "۱٬۰۰۰", detail: "از API" },
        ]}
        roleLabel="مالک"
        persistenceLabel="postgres"
        pending={false}
        onRefresh={onRefresh}
      />,
    );
    expect(container).toBeEmptyDOMElement();
    expect(onRefresh).not.toHaveBeenCalled();
  });
});
