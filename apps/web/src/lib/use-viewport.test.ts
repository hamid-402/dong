/**
 * @vitest-environment node
 */
import { describe, expect, it } from "vitest";
import {
  readAdaptiveMosaicMode,
  readViewportMode,
  VIEWPORT_OPS_ROOM_MIN,
} from "./use-viewport";

describe("viewport mosaic modes", () => {
  it("maps widths to viewport bands", () => {
    expect(readViewportMode(500)).toBe("mobile");
    expect(readViewportMode(800)).toBe("tablet");
    expect(readViewportMode(1100)).toBe("desktop");
  });

  it("uses 1200px for operations-room mosaic", () => {
    expect(VIEWPORT_OPS_ROOM_MIN).toBe(1200);
    expect(readAdaptiveMosaicMode(767)).toBe("launcher");
    expect(readAdaptiveMosaicMode(900)).toBe("hybrid");
    expect(readAdaptiveMosaicMode(1200)).toBe("operations-room");
  });
});
