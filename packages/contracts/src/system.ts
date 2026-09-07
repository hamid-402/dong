/** Runtime system capabilities and readiness — single source for API + web. */

import type { ProductFeatureFlags } from "./product-flags.js";

export type PersistenceKind = "memory" | "postgres";

export type SystemCapabilities = {
  version: string;
  allowDevAuth: boolean;
  oidcConfigured: boolean;
  databaseConfigured: boolean;
  /** Present when TOTP MFA API is available. */
  mfa?: boolean;
  readiness: "ready" | "degraded";
  /**
   * Dong 2.0 product flags from env (honest — UI must hide unfinished features).
   * Does not disable MFA/authz.
   */
  productFlags?: ProductFeatureFlags;
  persistence: {
    iam: PersistenceKind;
    audit: PersistenceKind;
    ledger: PersistenceKind;
    expense: PersistenceKind;
    settlement: PersistenceKind;
    partnership: PersistenceKind;
    procurement: PersistenceKind;
    proposals: PersistenceKind;
    billing: PersistenceKind;
    comment: PersistenceKind;
    notification: PersistenceKind;
    attachment: PersistenceKind;
    payment: PersistenceKind;
    asset: PersistenceKind;
    personalFinance: PersistenceKind;
    workspaceDay: PersistenceKind;
    workspaceRangeLock: PersistenceKind;
    account: PersistenceKind;
    costCenter: PersistenceKind;
    procurementVendorPoDelivery: PersistenceKind;
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
    /** Table-backed rates; conversion remains intentionally non-live. */
    fx?: "stub" | "table";
  };
  /** False until a production conversion/accounting engine is implemented. */
  conversionLive?: false;
  integrationsReady?: {
    zarinpal: { merchantConfigured: boolean; enabled: boolean };
    clamav: { hostConfigured: boolean; enabled: boolean };
    smtp: { urlConfigured: boolean; enabled: boolean };
    ocrHttp: { urlConfigured: boolean; enabled: boolean };
    workerConsumer: { redisConfigured: boolean; heartbeatAlive: boolean };
  };
  financeVerticalSlice?: readonly string[];
  procurementVerticalSlice?: readonly string[];
  partnershipVerticalSlice?: readonly string[];
  paymentHardening?: readonly string[];
};

export type HealthReadyResponse = {
  status: "ready" | "degraded";
  version: string;
  service?: string;
  requirePostgres?: boolean;
  checks: {
    iam: PersistenceKind;
    databaseConfigured: boolean;
    oidcConfigured: boolean;
    allowDevAuth: boolean;
    database?: string;
    redis?: string;
  };
};
