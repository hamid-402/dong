import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/api/client";
import { friendlyErrorMessage } from "@/lib/api-errors";

describe("friendlyErrorMessage G14 plan gate", () => {
  it("maps plan_required without premium upsell copy", () => {
    const err = new ApiError("قابلیت «analytics» در پلن free فعال نیست", 403, "plan_required");
    expect(friendlyErrorMessage(err, "fallback")).toMatch(/در دسترس نیست/);
    expect(friendlyErrorMessage(err, "fallback")).not.toMatch(/ارتقا/);
  });

  it("keeps generic 403 when not plan-related", () => {
    const err = new ApiError("MEMBERSHIP_FORBIDDEN", 403);
    expect(friendlyErrorMessage(err, "fallback")).toMatch(/نقش شما|مادرخرج|fallback|MEMBERSHIP/);
  });
});
