import type { WorkspaceSummary } from "@dang/contracts";
import { apiFetch } from "./client";

export type SystemCapabilities = {
  version: string;
  allowDevAuth: boolean;
  oidcConfigured: boolean;
  databaseConfigured: boolean;
  /** Present when TOTP MFA API is available. */
  mfa?: boolean;
  readiness: "ready" | "degraded";
  persistence: {
    iam: "memory" | "postgres";
    audit: "memory" | "postgres";
    ledger: "memory" | "postgres";
    expense: "memory" | "postgres";
    settlement: "memory" | "postgres";
    partnership: "memory" | "postgres";
    procurement: "memory" | "postgres";
    proposals: "memory" | "postgres";
    billing: "memory" | "postgres";
    comment: "memory" | "postgres";
    notification: "memory" | "postgres";
    attachment: "memory" | "postgres";
    payment: "memory" | "postgres";
    asset: "memory" | "postgres";
    personalFinance: "memory" | "postgres";
    workspaceDay: "memory" | "postgres";
    workspaceRangeLock: "memory" | "postgres";
    account: "memory" | "postgres";
    procurementVendorPoDelivery: "memory" | "postgres";
    attachmentBlob: "local" | "none";
  };
  stubs: {
    paymentProvider: boolean;
    ocr: boolean;
    avScan: boolean;
    backgroundWorker: boolean;
    emailDelivery: boolean;
  };
  providers?: {
    payment: "stub" | "zarinpal";
    ocr: "stub" | "configured";
    antivirus: "stub" | "configured";
    jobs: "inline_stub" | "redis_queue";
    email: "log" | "resend" | "smtp" | "none";
    attachmentBlob: "local" | "none";
  };
  integrationsReady?: {
    zarinpal: { merchantConfigured: boolean; enabled: boolean };
    clamav: { hostConfigured: boolean; enabled: boolean };
    smtp: { urlConfigured: boolean; enabled: boolean };
    ocrHttp: { urlConfigured: boolean; enabled: boolean };
    workerConsumer: { redisConfigured: boolean; heartbeatAlive: boolean };
  };
};

export type HealthReadyResponse = {
  status: "ready" | "degraded";
  version: string;
  checks: {
    iam: "memory" | "postgres";
    databaseConfigured: boolean;
    oidcConfigured: boolean;
    allowDevAuth: boolean;
  };
};

/** System capability, health and demo-seed endpoints — domain slice (dong-50 #30). */
export const systemApi = {
  capabilities: () => apiFetch<SystemCapabilities>("/system/capabilities"),
  healthReady: () => apiFetch<HealthReadyResponse>("/health/ready"),
  seedDemo: () =>
    apiFetch<{
      workspace: WorkspaceSummary;
      reused: boolean;
      persistence: Record<string, string>;
    }>("/demo/seed", { method: "POST", body: "{}" }),
};
