/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { EmptyStateBlock } from "@/components/ui-blocks";

describe("EmptyStateBlock", () => {
  afterEach(() => {
    cleanup();
  });

  it("uses a shell line icon instead of sticker art", () => {
    render(<EmptyStateBlock title="هنوز هزینه‌ای ثبت نشده" sticker="ledger" />);
    expect(screen.getByText("هنوز هزینه‌ای ثبت نشده")).toBeTruthy();
    expect(document.querySelector(".shell-icon")).toBeTruthy();
    expect(document.querySelector(".dang-sticker")).toBeNull();
  });

  it("hides the mark when the sticker is null", () => {
    render(<EmptyStateBlock title="خالی" sticker={null} />);
    expect(document.querySelector(".shell-icon")).toBeNull();
  });
});
