import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const tokensPath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../../packages/ui/src/tokens.css",
);

const THEMES = ["white", "black", "paper", "midnight"] as const;
type ThemeId = (typeof THEMES)[number];

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

function hue(hex: string): number {
  const r = Number.parseInt(hex.slice(1, 3), 16) / 255;
  const g = Number.parseInt(hex.slice(3, 5), 16) / 255;
  const b = Number.parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  if (delta === 0) return 0;
  let h =
    max === r ? ((g - b) / delta) % 6 : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4;
  h *= 60;
  if (h < 0) h += 360;
  return h;
}

function hueDistance(a: string, b: string): number {
  const delta = Math.abs(hue(a) - hue(b));
  return Math.min(delta, 360 - delta);
}

function saturation(hex: string): number {
  const r = Number.parseInt(hex.slice(1, 3), 16) / 255;
  const g = Number.parseInt(hex.slice(3, 5), 16) / 255;
  const b = Number.parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const light = (max + min) / 2;
  const delta = max - min;
  if (delta === 0) return 0;
  return delta / (1 - Math.abs(2 * light - 1));
}

function themeBlock(css: string, theme: ThemeId): { props: Record<string, string>; scheme: string } {
  const marker = `[data-theme="${theme}"]`;
  const start = css.indexOf(marker);
  const brace = css.indexOf("{", start);
  let depth = 0;
  let end = brace;
  for (let i = brace; i < css.length; i += 1) {
    if (css[i] === "{") depth += 1;
    else if (css[i] === "}") {
      depth -= 1;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  const slice = css.slice(brace, end);
  const props: Record<string, string> = {};
  for (const match of slice.matchAll(/(--dang-[\w-]+):\s*(#[0-9a-fA-F]{6})/g)) {
    props[match[1]!] = match[2]!.toLowerCase();
  }
  const scheme = slice.match(/color-scheme:\s*(light|dark)/)?.[1] ?? "";
  return { props, scheme };
}

describe("ledger palette contrast", () => {
  const css = readFileSync(tokensPath, "utf8");
  const themes = Object.fromEntries(
    THEMES.map((id) => [id, themeBlock(css, id)]),
  ) as Record<ThemeId, ReturnType<typeof themeBlock>>;

  it("locks the four blue-accent palettes", () => {
    const white = themes.white.props;
    const black = themes.black.props;
    const paper = themes.paper.props;
    const midnight = themes.midnight.props;

    expect(white["--dang-bg"]).toBe("#ffffff");
    expect(white["--dang-surface"]).toBe("#f4f4f5");
    expect(white["--dang-text"]).toBe("#141414");
    expect(white["--dang-muted"]).toBe("#4e4e52");
    expect(white["--dang-primary"]).toBe("#2f56b0");
    expect(white["--dang-primary-ink"]).toBe("#ffffff");
    expect(white["--dang-line"]).toBe("#616168");
    expect(white["--dang-focus"]).toBe("#2f56b0");
    expect(white["--dang-primary-soft"]).toBe("#e4e8f2");
    expect(white["--dang-primary-line"]).toBe("#637cb6");

    expect(black["--dang-bg"]).toBe("#000000");
    expect(black["--dang-surface"]).toBe("#161616");
    expect(black["--dang-text"]).toBe("#e4e4e4");
    expect(black["--dang-text"]).not.toBe("#ffffff");
    expect(black["--dang-primary"]).toBe("#8ca8d9");
    expect(black["--dang-primary-ink"]).toBe("#0a1730");
    expect(black["--dang-line"]).toBe("#8f8f8f");
    expect(black["--dang-focus"]).toBe("#8ca8d9");
    expect(black["--dang-primary-soft"]).toBe("#1a1c22");
    expect(black["--dang-primary-line"]).toBe("#58719d");

    expect(paper["--dang-bg"]).toBe("#f7f4ee");
    expect(paper["--dang-surface"]).toBe("#fffcf7");
    expect(paper["--dang-text"]).toBe("#1c1915");
    expect(paper["--dang-muted"]).toBe("#5e574e");
    expect(paper["--dang-primary"]).toBe("#123ece");
    expect(paper["--dang-line"]).toBe("#7a7268");
    expect(paper["--dang-danger"]).toBe("#a11612");
    expect(paper["--dang-success"]).toBe("#0c6a34");
    expect(paper["--dang-warning"]).toBe("#8a4804");
    expect(paper["--dang-primary-soft"]).toBe("#d5def6");
    expect(paper["--dang-primary-line"]).toBe("#3055cf");

    expect(midnight["--dang-bg"]).toBe("#121826");
    expect(midnight["--dang-surface"]).toBe("#1a2233");
    expect(midnight["--dang-text"]).toBe("#e6e9f2");
    expect(midnight["--dang-primary"]).toBe("#7aa5ff");
    expect(midnight["--dang-line"]).toBe("#9aa6be");
    expect(midnight["--dang-focus"]).toBe("#7aa5ff");
    expect(midnight["--dang-primary-soft"]).toBe("#1a2642");
    expect(midnight["--dang-primary-line"]).toBe("#6e90dd");

    expect(themes.white.scheme).toBe("light");
    expect(themes.paper.scheme).toBe("light");
    expect(themes.black.scheme).toBe("dark");
    expect(themes.midnight.scheme).toBe("dark");
    expect(css).not.toContain('data-theme="light"');
    expect(css).not.toContain('data-theme="dark"');
    expect(css).not.toContain('data-theme="dusk"');
    expect(css).not.toContain('data-theme="mist"');
    expect(css).not.toContain('data-theme="linear"');
    expect(css).not.toContain("data-atmosphere");
  });

  it("meets WCAG AA on every theme", () => {
    for (const id of THEMES) {
      const props = themes[id].props;
      const bg = props["--dang-bg"]!;
      const surface = props["--dang-surface"]!;
      const field = props["--dang-surface-2"]!;
      const text = props["--dang-text"]!;
      const muted = props["--dang-muted"]!;
      const accent = props["--dang-primary"]!;
      const link = props["--dang-link"]!;
      const ink = props["--dang-primary-ink"]!;
      const deep = props["--dang-primary-deep"]!;
      const danger = props["--dang-danger"]!;
      const success = props["--dang-success"]!;
      const warning = props["--dang-warning"]!;
      const line = props["--dang-line"]!;
      const focus = props["--dang-focus"]!;

      expect(contrast(text, bg), `${id} text/bg`).toBeGreaterThanOrEqual(4.5);
      expect(contrast(text, surface), `${id} text/surface`).toBeGreaterThanOrEqual(4.5);
      expect(contrast(muted, bg), `${id} muted/bg`).toBeGreaterThanOrEqual(4.5);
      expect(contrast(muted, surface), `${id} muted/surface`).toBeGreaterThanOrEqual(4.5);
      expect(contrast(accent, bg), `${id} accent text/bg`).toBeGreaterThanOrEqual(4.5);
      expect(contrast(accent, surface), `${id} accent text/surface`).toBeGreaterThanOrEqual(4.5);
      expect(contrast(link, bg), `${id} link/bg`).toBeGreaterThanOrEqual(4.5);
      expect(contrast(ink, accent), `${id} button text/accent`).toBeGreaterThanOrEqual(4.5);
      expect(contrast(ink, deep), `${id} button text/accent-deep`).toBeGreaterThanOrEqual(4.5);
      expect(contrast(danger, bg), `${id} danger/bg`).toBeGreaterThanOrEqual(4.5);
      expect(contrast(success, bg), `${id} success/bg`).toBeGreaterThanOrEqual(4.5);
      expect(contrast(warning, bg), `${id} warning/bg`).toBeGreaterThanOrEqual(4.5);
      expect(contrast(danger, surface), `${id} danger/surface`).toBeGreaterThanOrEqual(4.5);
      expect(contrast(success, surface), `${id} success/surface`).toBeGreaterThanOrEqual(4.5);
      expect(contrast(warning, surface), `${id} warning/surface`).toBeGreaterThanOrEqual(4.5);
      expect(contrast(line, bg), `${id} border/bg`).toBeGreaterThanOrEqual(3);
      expect(contrast(line, surface), `${id} border/surface`).toBeGreaterThanOrEqual(3);
      expect(contrast(line, field), `${id} border/field`).toBeGreaterThanOrEqual(3);
      expect(contrast(focus, bg), `${id} focus/bg`).toBeGreaterThanOrEqual(3);
      expect(contrast(focus, surface), `${id} focus/surface`).toBeGreaterThanOrEqual(3);

      expect(hueDistance(accent, danger), `${id} accent/danger`).toBeGreaterThanOrEqual(40);
      expect(hueDistance(accent, success), `${id} accent/success`).toBeGreaterThanOrEqual(40);
      expect(hueDistance(accent, warning), `${id} accent/warning`).toBeGreaterThanOrEqual(40);
    }
  });

  const TINTS = ["primary", "success", "warning", "danger", "info", "gold"] as const;

  it("keeps tinted surfaces softer on white/black and richer on paper/midnight", () => {
    for (const tone of TINTS) {
      const soft = `--dang-${tone}-soft`;
      const line = `--dang-${tone}-line`;
      expect(saturation(themes.white.props[soft]!), `${tone} white soft`).toBeLessThan(
        saturation(themes.paper.props[soft]!),
      );
      expect(saturation(themes.black.props[soft]!), `${tone} black soft`).toBeLessThan(
        saturation(themes.midnight.props[soft]!),
      );
      const whiteEdge = contrast(themes.white.props[line]!, themes.white.props["--dang-surface"]!);
      const paperEdge = contrast(themes.paper.props[line]!, themes.paper.props["--dang-surface"]!);
      const blackEdge = contrast(themes.black.props[line]!, themes.black.props["--dang-surface"]!);
      const midnightEdge = contrast(
        themes.midnight.props[line]!,
        themes.midnight.props["--dang-surface"]!,
      );
      expect(paperEdge, `${tone} paper border`).toBeGreaterThan(whiteEdge);
      expect(midnightEdge, `${tone} midnight border`).toBeGreaterThan(blackEdge);
    }
    expect(saturation(themes.white.props["--dang-primary"]!)).toBeLessThan(
      saturation(themes.paper.props["--dang-primary"]!),
    );
    expect(saturation(themes.black.props["--dang-primary"]!)).toBeLessThan(
      saturation(themes.midnight.props["--dang-primary"]!),
    );
  });

  it("meets WCAG AA on tinted surfaces", () => {
    for (const id of THEMES) {
      const props = themes[id].props;
      const bg = props["--dang-bg"]!;
      const surface = props["--dang-surface"]!;
      const text = props["--dang-text"]!;
      const muted = props["--dang-muted"]!;
      for (const tone of TINTS) {
        const ink = props[`--dang-${tone}`]!;
        const soft = props[`--dang-${tone}-soft`]!;
        const mid = props[`--dang-${tone}-mid`]!;
        const line = props[`--dang-${tone}-line`]!;
        expect(soft, `${id} ${tone} soft`).toMatch(/^#[0-9a-f]{6}$/);
        expect(mid, `${id} ${tone} mid`).toMatch(/^#[0-9a-f]{6}$/);
        expect(line, `${id} ${tone} line`).toMatch(/^#[0-9a-f]{6}$/);
        expect(contrast(text, soft), `${id} text/${tone}-soft`).toBeGreaterThanOrEqual(4.5);
        expect(contrast(muted, soft), `${id} muted/${tone}-soft`).toBeGreaterThanOrEqual(4.5);
        expect(contrast(ink, soft), `${id} ${tone}/${tone}-soft`).toBeGreaterThanOrEqual(4.5);
        expect(contrast(text, mid), `${id} text/${tone}-mid`).toBeGreaterThanOrEqual(4.5);
        expect(contrast(muted, mid), `${id} muted/${tone}-mid`).toBeGreaterThanOrEqual(4.5);
        expect(contrast(ink, mid), `${id} ${tone}/${tone}-mid`).toBeGreaterThanOrEqual(4.5);
        expect(contrast(line, bg), `${id} ${tone}-line/bg`).toBeGreaterThanOrEqual(3);
        expect(contrast(line, surface), `${id} ${tone}-line/surface`).toBeGreaterThanOrEqual(3);
        expect(contrast(line, soft), `${id} ${tone}-line/soft`).toBeGreaterThanOrEqual(3);
        expect(contrast(line, mid), `${id} ${tone}-line/mid`).toBeGreaterThanOrEqual(3);
      }
    }
  });
});
