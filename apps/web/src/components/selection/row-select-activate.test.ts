/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from "vitest";
import { isRowSelectIgnoredTarget } from "./row-select-activate";

describe("isRowSelectIgnoredTarget", () => {
  it("ignores clicks on buttons and links", () => {
    const root = document.createElement("div");
    const btn = document.createElement("button");
    root.appendChild(btn);
    expect(isRowSelectIgnoredTarget(btn)).toBe(true);

    const link = document.createElement("a");
    link.href = "#";
    root.appendChild(link);
    expect(isRowSelectIgnoredTarget(link)).toBe(true);
  });

  it("allows clicks on plain row text", () => {
    const cell = document.createElement("td");
    cell.textContent = "نان";
    expect(isRowSelectIgnoredTarget(cell)).toBe(false);
  });
});
