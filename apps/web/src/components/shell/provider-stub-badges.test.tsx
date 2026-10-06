/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from "vitest";
import type { SystemCapabilities } from "@dang/contracts";
import { providerStubBadgesFromCapabilities } from "./provider-stub-badges";

function baseCaps(
  overrides: Partial<SystemCapabilities> = {},
): SystemCapabilities {
  return {
    version: "0.1.0",
    allowDevAuth: true,
    oidcConfigured: false,
    databaseConfigured: true,
    readiness: "ready",
    persistence: {
      iam: "postgres",
      audit: "postgres",
      ledger: "postgres",
      expense: "postgres",
      settlement: "postgres",
      partnership: "postgres",
      procurement: "postgres",
      proposals: "postgres",
      billing: "postgres",
      comment: "postgres",
      notification: "postgres",
      attachment: "postgres",
      payment: "postgres",
      asset: "postgres",
      personalFinance: "postgres",
      workspaceDay: "postgres",
      workspaceRangeLock: "postgres",
      account: "postgres",
      costCenter: "postgres",
      procurementVendorPoDelivery: "postgres",
      outbox: "postgres",
      attachmentBlob: "local",
    },
    stubs: {
      paymentProvider: false,
      ocr: true,
      avScan: true,
      backgroundWorker: false,
      emailDelivery: true,
    },
    providers: {
      payment: "local_psp",
      ocr: "stub",
      antivirus: "stub",
      jobs: "redis_queue",
      email: "log",
      attachmentBlob: "local",
      messaging: "stub",
      sms: "stub",
    },
    ...overrides,
  };
}

describe("providerStubBadgesFromCapabilities", () => {
  it("returns empty for null capabilities", () => {
    expect(providerStubBadgesFromCapabilities(null)).toEqual([]);
  });

  it("labels OCR/AV/email stubs and Local PSP mode from live caps", () => {
    const badges = providerStubBadgesFromCapabilities(baseCaps());
    const labels = badges.map((b) => b.label);
    expect(labels).toContain("خواندن رسید: آزمایشی");
    expect(labels).toContain("آنتی‌ویروس: آزمایشی");
    expect(labels.some((l) => l.includes("ایمیل"))).toBe(true);
    expect(labels).toContain("درگاه: محلی (زرین‌پال وصل نیست)");
    expect(labels).toContain("پیام‌رسان: آزمایشی");
    expect(labels).toContain("پیامک: آزمایشی");
    expect(labels.some((l) => l.includes("پس‌زمینه"))).toBe(false);
  });

  it("labels redis_queue_degraded as worker/queue stub", () => {
    const badges = providerStubBadgesFromCapabilities(
      baseCaps({
        stubs: {
          paymentProvider: false,
          ocr: false,
          avScan: false,
          backgroundWorker: true,
          emailDelivery: false,
        },
        providers: {
          payment: "zarinpal",
          ocr: "configured",
          antivirus: "configured",
          jobs: "redis_queue_degraded",
          email: "smtp",
          attachmentBlob: "local",
        },
      }),
    );
    expect(badges.some((b) => b.label.includes("بدون کارگر"))).toBe(true);
  });

  it("omits Local PSP mode when zarinpal is live and stubs cleared", () => {
    const badges = providerStubBadgesFromCapabilities(
      baseCaps({
        stubs: {
          paymentProvider: false,
          ocr: false,
          avScan: false,
          backgroundWorker: false,
          emailDelivery: false,
        },
        providers: {
          payment: "zarinpal",
          ocr: "configured",
          antivirus: "configured",
          jobs: "redis_queue",
          email: "smtp",
          attachmentBlob: "local",
        },
      }),
    );
    expect(badges).toEqual([]);
  });

  it("labels FX surface when conversionLive is false", () => {
    const badges = providerStubBadgesFromCapabilities(
      baseCaps({
        stubs: {
          paymentProvider: false,
          ocr: false,
          avScan: false,
          backgroundWorker: false,
          emailDelivery: false,
        },
        providers: {
          payment: "zarinpal",
          ocr: "configured",
          antivirus: "configured",
          jobs: "redis_queue",
          email: "smtp",
          attachmentBlob: "local",
          fxPreview: "preview_v1",
        },
        conversionLive: false,
      }),
    );
    expect(badges.some((b) => b.key === "fx" && b.label.includes("تبدیل ارز"))).toBe(
      true,
    );
  });
});
