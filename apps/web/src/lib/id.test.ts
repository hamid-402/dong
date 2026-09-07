import { describe, expect, it } from "vitest";
import { newClientId } from "@/lib/id";

describe("newClientId", () => {
  it("returns a non-empty id even when randomUUID is unavailable", () => {
    const original = globalThis.crypto?.randomUUID;
    try {
      if (globalThis.crypto) {
        // Simulate insecure-context browsers (HTTP on LAN IP).
        Object.defineProperty(globalThis.crypto, "randomUUID", {
          configurable: true,
          value: undefined,
        });
      }
      const id = newClientId();
      expect(id.length).toBeGreaterThan(8);
      expect(id).not.toEqual(newClientId());
    } finally {
      if (globalThis.crypto && original) {
        Object.defineProperty(globalThis.crypto, "randomUUID", {
          configurable: true,
          value: original,
        });
      }
    }
  });
});
