/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { usePersonalFinanceHashScroll } from "./use-personal-finance-hash-scroll";

describe("usePersonalFinanceHashScroll G16", () => {
  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn();
    document.body.innerHTML = `
      <div id="overview"></div>
      <div id="goals"></div>
      <div id="charts"></div>
      <div id="resources"></div>
    `;
  });

  afterEach(() => {
    window.location.hash = "";
    document.body.innerHTML = "";
    vi.restoreAllMocks();
  });

  it("scrolls to known hash on mount", () => {
    window.location.hash = "#goals";
    renderHook(() => usePersonalFinanceHashScroll());
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
  });

  it("ignores unknown hash", () => {
    window.location.hash = "#unknown";
    renderHook(() => usePersonalFinanceHashScroll());
    expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled();
  });
});
