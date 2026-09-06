import { NextResponse } from "next/server";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/** Browsers request /favicon.ico by default; serve the SVG brand mark. */
export function GET() {
  const svg = readFileSync(join(process.cwd(), "public", "icon.svg"));
  return new NextResponse(svg, {
    headers: {
      "Content-Type": "image/svg+xml",
      "Cache-Control": "public, max-age=86400",
    },
  });
}
