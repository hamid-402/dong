import { describe, expect, it } from "vitest";
import {
  DEFAULT_MOTION,
  effectiveMotion,
  isAppMotion,
  motionAllowsAmbient,
  motionAllowsFeedback,
  motionAllowsNarrative,
} from "./motion-levels";

describe("motion-levels", () => {
  it("keeps decorative motion off unless the user stored another level", () => {
    expect(DEFAULT_MOTION).toBe("off");
  });

  it("parses known motion ids", () => {
    expect(isAppMotion("full")).toBe(true);
    expect(isAppMotion("essential")).toBe(true);
    expect(isAppMotion("off")).toBe(true);
    expect(isAppMotion("loud")).toBe(false);
  });

  it("forces essential (not blank) when OS reduced-motion is on", () => {
    expect(effectiveMotion("full", true)).toBe("essential");
    expect(effectiveMotion("essential", true)).toBe("essential");
    expect(effectiveMotion("off", true)).toBe("off");
    expect(effectiveMotion("full", false)).toBe("full");
  });

  it("maps three conceptual layers", () => {
    expect(motionAllowsAmbient("full")).toBe(true);
    expect(motionAllowsAmbient("essential")).toBe(false);
    expect(motionAllowsFeedback("essential")).toBe(true);
    expect(motionAllowsFeedback("off")).toBe(false);
    expect(motionAllowsNarrative("full")).toBe(true);
    expect(motionAllowsNarrative("essential")).toBe(false);
  });
});
