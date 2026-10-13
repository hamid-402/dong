import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { DEFAULT_MOTION } from "./motion-levels";

const here = dirname(fileURLToPath(import.meta.url));

function read(relative: string): string {
  return readFileSync(resolve(here, relative), "utf8");
}

const PRODUCT_CSS = [
  "../app/shell.css",
  "../app/globals.css",
  "../components/shell/contextual-mosaic-hub.module.css",
];

describe("phase 5 chrome", () => {
  it("defaults decorative motion to off", () => {
    expect(DEFAULT_MOTION).toBe("off");
    const layout = read("../app/layout.tsx");
    expect(layout).toContain('data-motion="off"');
    expect(layout).toContain('m="off"');
    expect(layout).not.toContain('m="full"');
  });

  it("does not style everyday UI with retired themes or gem tiles", () => {
    for (const file of PRODUCT_CSS) {
      const css = read(file);
      expect(css, file).not.toMatch(/data-theme\s*=\s*["']dusk["']/);
      expect(css, file).not.toMatch(/data-theme\s*=\s*["']mist["']/);
      expect(css, file).not.toMatch(/data-theme\s*=\s*["']linear["']/);
      expect(css, file).not.toMatch(/\.dang-gem[\s.:{,#[]/);
    }
  });

  it("keeps primary chrome at 44px and a visible focus outline", () => {
    const css = read("../app/shell.css");
    expect(css).toContain("min-height: 44px");
    expect(css).toContain("min-width: 44px");
    expect(css).toContain("outline: 3px solid var(--dang-focus, var(--primary))");
    expect(css).toContain("max-width: 420px");
    expect(css).toContain("min-width: 1280px");
  });
});
