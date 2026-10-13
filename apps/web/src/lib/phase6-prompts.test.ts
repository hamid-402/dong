import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const srcRoot = resolve(here, "..");

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === ".next") continue;
      sourceFiles(path, out);
      continue;
    }
    if (!/\.(ts|tsx)$/.test(entry.name)) continue;
    if (entry.name.includes(".test.")) continue;
    out.push(path);
  }
  return out;
}

describe("phase 6 prompts and touch targets", () => {
  it("does not call window.prompt", () => {
    const hits = sourceFiles(srcRoot).filter((path) =>
      readFileSync(path, "utf8").includes("window.prompt"),
    );
    expect(hits).toEqual([]);
  });

  it("keeps the post-settlement feedback controls at 44px", () => {
    const css = readFileSync(resolve(here, "../app/globals.css"), "utf8");
    const block = css.slice(css.indexOf(".npsPrompt__btn{"));
    expect(block.startsWith(".npsPrompt__btn{")).toBe(true);
    expect(block.slice(0, 400)).toContain("min-height: 44px");
    expect(block.slice(0, 800)).toContain(".npsPrompt__actions .textButton");
    expect(block.indexOf("min-height: 44px")).toBeLessThan(block.indexOf(".npsPrompt__btn:hover"));
  });

  it("draws the first-run tour with shell icons", () => {
    const tour = readFileSync(
      resolve(here, "../components/views/first-run-tour.tsx"),
      "utf8",
    );
    expect(tour).toContain("ShellIconSvg");
    expect(tour).not.toContain("StickerSvg");
  });
});
