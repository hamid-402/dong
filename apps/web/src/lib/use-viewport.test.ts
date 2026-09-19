import { describe, expect, it } from "vitest";
import {
  VIEWPORT_DESKTOP_MIN,
  VIEWPORT_TABLET_MIN,
  readViewportMode,
} from "./use-viewport";

describe("readViewportMode", () => {
  it("aligns desktop with shell.css 1024px breakpoint", () => {
    expect(VIEWPORT_DESKTOP_MIN).toBe(1024);
    expect(readViewportMode(1023)).toBe("tablet");
    expect(readViewportMode(1024)).toBe("desktop");
    expect(readViewportMode(1400)).toBe("desktop");
  });

  it("treats tablet from 768", () => {
    expect(VIEWPORT_TABLET_MIN).toBe(768);
    expect(readViewportMode(767)).toBe("mobile");
    expect(readViewportMode(768)).toBe("tablet");
  });
});
