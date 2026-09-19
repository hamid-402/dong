/** Runtime system capabilities and readiness — single source for API + web. */

import type { ProductFeatureFlags } from "./product-flags.js";
import type { PenTestEngagementStatus } from "./pen-test-status.js";

export type PersistenceKind = "memory" | "postgres";

export type SystemCapabilities = {
  version: string;
  allowDevAuth: boolean;
  /**
   * Explicit demo seed allowed (S11-14). Always false when NODE_ENV=production.
   * UI must gate demo buttons on this (or allowDevAuth when absent for older APIs).
   */
  demoSeedAllowed?: boolean;
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
    /** S11-10 savings goals / income / monthly close store. */
    personalGoals?: PersistenceKind;
    workspaceDay: PersistenceKind;
    workspaceRangeLock: PersistenceKind;
    account: PersistenceKind;
    costCenter: PersistenceKind;
    procurementVendorPoDelivery: PersistenceKind;
    /** Transactional outbox for domain side-effects (R10-03). */
    outbox: PersistenceKind;
    /** Analytics warehouse facts (R10-20). */
    analytics?: PersistenceKind;
    /** Goods/services catalog (S11-06). */
    catalog?: PersistenceKind;
    /** Member statement exports (S11-08). */
    statements?: PersistenceKind;
    /** Workspace payout instructions for statements (destination account). */
    payoutInstructions?: PersistenceKind;
    /** Payment receipts / petty cash / credit (S11-09). */
    paymentOps?: PersistenceKind;
    /** Structured security events store (R10-15). */
    securityEvents?: PersistenceKind;
    /** Local key vault ciphertext store (R10-06). */
    keyVault?: PersistenceKind;
    /** Friends / directory privacy (S11-02). */
    social?: PersistenceKind;
    /** Job enqueue history (ops.job_run when postgres). */
    jobRuns?: PersistenceKind;
    /** Multi-approver decision rows (finance.approval_decision). */
    approvalDecisions?: PersistenceKind;
    /** Outbound workspace webhooks store (G15). */
    webhooks?: PersistenceKind;
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
    /**
     * local_psp = in-repo primary checkout (always available).
     * zarinpal = only when merchant id + ZARINPAL_ENABLED (never faked).
     * stub = legacy / unused for new links.
     */
    payment: "stub" | "local_psp" | "zarinpal";
    ocr: "stub" | "configured";
    antivirus: "stub" | "configured";
    jobs: "inline_stub" | "redis_queue";
    email: "log" | "resend" | "smtp" | "none";
    attachmentBlob: "local" | "none";
    /** Table-backed rates; conversion remains intentionally non-live. */
    fx?: "stub" | "table";
    /** Span pipeline: off | local ALS spans | OTLP export configured. */
    tracing?: "off" | "local_spans" | "otlp";
    /** Outbox relay availability. */
    outbox?: "none" | "memory" | "postgres";
    /**
     * Audit integrity mode (R10-04).
     * append_only = revoke UPDATE/DELETE; hash_chain = also event_hash/prev_hash.
     */
    auditIntegrity?: "append_only" | "hash_chain";
    /** Named role-set registry + light ABAC (R10-05) / grants (S11-04). */
    accessPolicy?:
      | "inline"
      | "role_sets_v1"
      | "rbac_abac_v1"
      | "rbac_abac_grants_v1";
    /** Persistence of workspace role grants / deputy windows (S11-04). */
    permissions?: "memory" | "postgres";
    /**
     * Secrets / key material source (R10-06).
     * env = process env keys; env_with_rotation = previous-key window set;
     * local_vault_v1 = in-repo AES-GCM vault store live (not HashiCorp/cloud).
     * External Vault/KMS not claimed until wired.
     */
    secrets?: "env" | "env_with_rotation" | "local_vault_v1";
    /**
     * Where the vault master key is resolved from (Phase 2.1).
     * env = DANG_MASTER_KEY / non-prod file; http_vault = VAULT_ADDR+TOKEN;
     * none = no master material (sealed); plaintext = synonym for none when field crypto is open.
     */
    masterKeySource?: "env" | "http_vault" | "none" | "plaintext";
    /**
     * Security event pipeline (R10-15).
     * structured_log = JSON on stdout; structured_log_store = also ops.security_event / ring.
     */
    securityEvents?: "none" | "structured_log" | "structured_log_store";
    /**
     * Realtime transport (R10-18).
     * sse_local = Server-Sent Events hub in this API process (not multi-node).
     * sse_redis = same SSE + Redis pub/sub fan-out when REDIS_URL is live.
     */
    realtime?: "none" | "sse_local" | "sse_redis";
    /**
     * Offline mutation queue support signal (R10-19).
     * mutation_queue_v1 = web may queue idempotent POSTs and flush on reconnect.
     */
    offlineSync?: "none" | "mutation_queue_v1";
    /**
     * Analytics warehouse (R10-20).
     * memory_etl | postgres_etl (co-located schema) | postgres_replica_etl (ANALYTICS_DATABASE_URL).
     */
    analyticsWarehouse?:
      | "none"
      | "memory_etl"
      | "postgres_etl"
      | "postgres_replica_etl";
    /**
     * Pen-test engagement honesty (R10-22).
     * prep_ready = threat model+scope+inventory done; not a passed pen-test.
     */
    penTest?: PenTestEngagementStatus;
    /**
     * Platform SaaS metering + subscription invoices (R10-21).
     * metering_v1 = usage from real stores; pay when payment=local_psp|zarinpal.
     */
    saasBilling?: "none" | "metering_v1";
    /**
     * Light antifraud heuristics (R10-17) — not ML.
     * heuristics_v1 = settlement + invite anomaly evaluators enforced on create.
     */
    antifraud?: "none" | "heuristics_v1";
    /**
     * Maker-checker (R10-25 / Phase 2.3).
     * four_eyes = sync gate only; four_eyes_queue_v1 = also surfaces in approval-queue;
     * four_eyes_tiers_v1 = multi-level tiers on approve hot path (+ queue when enabled).
     */
    makerChecker?:
      | "off"
      | "four_eyes"
      | "four_eyes_queue_v1"
      | "four_eyes_tiers_v1";
    /**
     * Queue SLA clock (R10-25 deepen).
     * hours_v1 = MAKER_CHECKER_SLA_HOURS drives slaDueAt/slaBreached on approval-queue items.
     */
    makerCheckerSla?: "off" | "hours_v1";
    /**
     * ledger.rebuild_balances honesty: ack_v1 = local_ack / health ping only
     * (balances are live journal compute — no durable projection table yet).
     */
    ledgerRebuild?: "ack_v1";
    /**
     * Invoice automation honesty.
     * live_invoice_sweep_v1 = a draft invoice is rewritten on every posting and
     * a background sweep rolls periods over, reconciles and reminds.
     * live_invoice_v1 = the same on-write projection, sweep timer off (the
     * work then only happens on a write or an explicit job run).
     */
    billingAutomation?: "live_invoice_sweep_v1" | "live_invoice_v1";
    /**
     * How far the reconcile pass can prove the books.
     * expense_ledger_invoice_v1 = committed expenses ↔ journal ↔ invoice.
     * expense_invoice_v1 = no journal available, projection check only.
     */
    invoiceReconcile?: "off" | "expense_invoice_v1" | "expense_ledger_invoice_v1";
    /**
     * Default product display unit for amounts (S11-05).
     * Storage remains IRR minor; this is the unresolved product default only.
     */
    displayUnit?: "rial" | "toman";
    /**
     * Social directory + friends (S11-02).
     */
    social?: "none" | "directory_friends_v1";
    /**
     * Goods/services catalog (S11-06).
     */
    catalog?: "none" | "catalog_v1";
    /**
     * Member statements + CSV/JSON export (S11-08).
     * csv_json_print_v1 = real endpoints; PDF via browser print page.
     */
    statements?: "none" | "csv_json_print_v1";
    /**
     * Workspace receiving-account instructions shown on statements.
     * workspace_v1 = GET/PUT payout-instructions live (not PSP custody).
     */
    payoutInstructions?: "none" | "workspace_v1";
    /**
     * At-rest sealing for payout destination_value (AES-GCM via master key).
     * aes_gcm_v1 when DANG_MASTER_KEY / local vault key is available; else plaintext.
     */
    payoutDestinationCrypto?: "plaintext" | "aes_gcm_v1";
    /**
     * Manual payment receipts with finance review (S11-09).
     */
    paymentReceipts?: "none" | "manual_review_v1";
    /**
     * Petty cash funds (S11-09).
     */
    pettyCash?: "none" | "fund_v1";
    /**
     * Pay on behalf of another member (S11-09 depth).
     * on_behalf_v1 = pending → finance/payer approve → journal.
     */
    paymentOnBehalf?: "none" | "on_behalf_v1";
    /**
     * Savings goals + contributions (S11-10).
     * goals_v1 = progress computed from real contributions only.
     */
    savingsGoals?: "none" | "goals_v1";
    /**
     * Real chart aggregates (S11-11).
     * charts_v1 = points from expenses / money_txn / analytics / monthly_close / savings.
     */
    charts?: "none" | "charts_v1";
    /** Workspace report CSV/XLSX export (G07). */
    reportExport?: "none" | "csv_xlsx_v1" | "csv_xlsx_ir_v1";
    /** Iranian accountant CSV layouts محک/سپیدار (G09 #34). */
    accountantExport?: "none" | "mohk_sepidar_v1";
    /** POST permissions/dry-run (G09 #51). */
    permissionsDryRun?: "none" | "dry_run_v1";
    /** Saved cross-workspace kind report views (G07). */
    reportViews?: "none" | "report_views_v1";
    /**
     * Platform admin console (S11-13).
     * platform_v1 = /platform APIs + break-glass store are live.
     */
    platformAdmin?: "none" | "platform_v1";
    /**
     * In-app SLO burn rates (R10-01 depth).
     * in_app_v1 = GET /platform/slo from live outbox/DLQ/security counters.
     */
    slo?: "none" | "in_app_v1";
    /**
     * Retention purge job (statements + blocked attachment blobs).
     * purge_v1 = RetentionService + retention.purge job are wired.
     * dry_run_purge_v1 = GET system/retention/dry-run preview counts (G12).
     */
    retention?: "none" | "purge_v1" | "dry_run_purge_v1";
    /**
     * Outbound workspace webhooks with HMAC (G12 #58).
     * hmac_v1 = CRUD + outbox fan-out for expense.posted / settlement.confirmed.
     */
    outboundWebhooks?: "none" | "hmac_v1";
    /**
     * Optional HTTP FX rate provider (G12 #59).
     * none = manual table only; http_v1 = FX_PROVIDER_URL configured.
     */
    fxProvider?: "none" | "http_v1";
    /**
     * Read-only FX convert preview from rate table (G13).
     * preview_v1 = POST /fx-rates/preview; when conversionLive, same math binds expense IRR.
     */
    fxPreview?: "none" | "preview_v1";
    /**
     * Per-event in-app notification prefs (Wave F).
     * in_app_v1 = delivery gated by GET/PUT /me/notification-prefs.
     */
    notificationEventPrefs?: "none" | "in_app_v1";
    /** Monthly building charge generation (G08). */
    buildingCharges?: "none" | "building_charges_v1";
    /** Partnership agreed price list (G10). */
    partnerPrices?: "none" | "partner_prices_v1";
    /** Asset straight-line monthly depreciation (G10). */
    assetDepreciation?: "none" | "depreciation_v1";
    /** PO → company expense draft link (G10). */
    poExpenseLink?: "none" | "po_expense_v1";
    /** Org expense policy (G09 — cost center, tiers, per diem). */
    expensePolicy?: "none" | "org_policy_g09_v1";
    /**
     * External messaging channel (G11 #44).
     * none = unset; stub = log-only adapter; telegram/bale = live bot token present.
     */
    messaging?: "none" | "stub" | "telegram" | "bale";
    /**
     * Transactional SMS separate from auth MFA (G11 #45).
     * never implies phone_verified_at; auth stays TOTP until a real OTP path exists.
     */
    sms?: "none" | "stub" | "live";
    /** Unified workspace activity cursor feed (G11 #60). */
    activityFeed?: "none" | "activity_v1";
  };
  /**
   * true when FX rate table is available (DATABASE_URL) and expense drafts
   * can bind originalCurrency → IRR total via the live conversion path.
   * Ledger storage remains IRR-only.
   */
  conversionLive?: boolean;
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
    database?: string;
    redisConfigured?: boolean;
    redis?: string;
    requirePostgres?: boolean;
  };
};
