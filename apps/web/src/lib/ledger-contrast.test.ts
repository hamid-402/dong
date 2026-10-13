import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const tokensPath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../../packages/ui/src/tokens.css",
);

function channel(hex: string, index: number): number {
  const value = Number.parseInt(hex.slice(1 + index * 2, 3 + index * 2), 16) / 255;
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function contrast(foreground: string, background: string): number {
  const luminance = (hex: string) =>
    0.2126 * channel(hex, 0) + 0.7152 * channel(hex, 1) + 0.0722 * channel(hex, 2);
  const lighter = Math.max(luminance(foreground), luminance(background));
  const darker = Math.min(luminance(foreground), luminance(background));
  return (lighter + 0.05) / (darker + 0.05);
}

function themeBlock(css: string, theme: "light" | "dark"): Record<string, string> {
  const marker = theme === "light" ? '[data-theme="light"]' : '[data-theme="dark"]';
  const start = css.indexOf(marker);
  const end = theme === "light" ? css.indexOf('[data-theme="dark"]') : css.length;
  const slice = css.slice(start, end);
  const props: Record<string, string> = {};
  for (const match of slice.matchAll(/(--dang-[\w-]+):\s*(#[0-9a-fA-F]{6})/g)) {
    props[match[1]!] = match[2]!.toLowerCase();
  }
  return props;
}

describe("ledger palette contrast", () => {
  const css = readFileSync(tokensPath, "utf8");
  const light = themeBlock(css, "light");
  const dark = themeBlock(css, "dark");

  it("locks the calm-ledger hex values", () => {
    expect(light["--dang-bg"]).toBe("#f7f4ee");
    expect(light["--dang-surface"]).toBe("#fffcf7");
    expect(light["--dang-text"]).toBe("#1c1915");
    expect(light["--dang-muted"]).toBe("#5e574e");
    expect(light["--dang-primary"]).toBe("#0e6b5c");
    expect(light["--dang-primary-ink"]).toBe("#ffffff");
    expect(light["--dang-line"]).toBe("#7a7268");
    expect(light["--dang-danger"]).toBe("#9f1d1d");
    expect(light["--dang-success"]).toBe("#146c36");
    expect(light["--dang-warning"]).toBe("#8a4b08");
    expect(dark["--dang-bg"]).toBe("#121614");
    expect(dark["--dang-surface"]).toBe("#1a211e");
    expect(dark["--dang-text"]).toBe("#f4f1ea");
    expect(dark["--dang-danger"]).toBe("#ffb4ab");
    expect(dark["--dang-line"]).toBe("#6e7a74");
    expect(css).not.toContain('data-theme="dusk"');
    expect(css).not.toContain('data-theme="mist"');
    expect(css).not.toContain('data-theme="linear"');
    expect(css).not.toContain("data-atmosphere");
  });

  it("meets the phase-1 WCAG pairs", () => {
    expect(contrast(light["--dang-text"]!, light["--dang-bg"]!)).toBeGreaterThanOrEqual(15);
    expect(contrast(light["--dang-muted"]!, light["--dang-bg"]!)).toBeGreaterThanOrEqual(6);
    expect(contrast(light["--dang-primary-ink"]!, light["--dang-primary"]!)).toBeGreaterThanOrEqual(6);
    expect(contrast(light["--dang-danger"]!, light["--dang-bg"]!)).toBeGreaterThanOrEqual(7);
    expect(contrast(light["--dang-success"]!, light["--dang-bg"]!)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(light["--dang-warning"]!, light["--dang-bg"]!)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(light["--dang-line"]!, light["--dang-bg"]!)).toBeGreaterThanOrEqual(3);
    expect(contrast(dark["--dang-text"]!, dark["--dang-bg"]!)).toBeGreaterThanOrEqual(15);
    expect(contrast(dark["--dang-danger"]!, dark["--dang-bg"]!)).toBeGreaterThanOrEqual(10);
    expect(contrast(dark["--dang-line"]!, dark["--dang-surface"]!)).toBeGreaterThanOrEqual(3.5);
    expect(contrast(dark["--dang-success"]!, dark["--dang-bg"]!)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(dark["--dang-warning"]!, dark["--dang-bg"]!)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(dark["--dang-primary-ink"]!, dark["--dang-primary"]!)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(dark["--dang-link"]!, dark["--dang-bg"]!)).toBeGreaterThanOrEqual(4.5);
  });
});
