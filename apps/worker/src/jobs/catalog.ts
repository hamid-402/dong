import type { FinanceVerticalSliceStep, WorkerJobName } from "@dang/contracts";
import { financeVerticalSliceSteps } from "@dang/contracts";
import { isRedisConfigured, loadAppEnv } from "@dang/config";

export type { WorkerJobName };
export type WorkerJobDefinition = {
  name: WorkerJobName;
  descriptionFa: string;
  phase: 2 | 3 | 4 | 5;
  requiresRedis: boolean;
};

export const workerJobCatalog: WorkerJobDefinition[] = [
  {
    name: "ocr.receipt",
    descriptionFa: "استخراج متن و اقلام از رسید",
    phase: 3,
    requiresRedis: true,
  },
  {
    name: "quarantine.scan",
    descriptionFa: "اسکن قرنطینه فایل (AV)",
    phase: 5,
    requiresRedis: true,
  },
  {
    name: "notify.email",
    descriptionFa: "ارسال اعلان ایمیل/پیام",
    phase: 2,
    requiresRedis: true,
  },
  {
    name: "notify.push",
    descriptionFa: "اعلان Push برای موبایل/PWA",
    phase: 2,
    requiresRedis: true,
  },
  {
    name: "report.export",
    descriptionFa: "ساخت PDF/Excel گزارش",
    phase: 4,
    requiresRedis: true,
  },
  {
    name: "webhook.dispatch",
    descriptionFa: "ارسال Webhook خروجی",
    phase: 5,
    requiresRedis: true,
  },
  {
    name: "ledger.rebuild_balances",
    descriptionFa: "بازسازی Projection مانده از دفترکل",
    phase: 2,
    requiresRedis: true,
  },
];

export type WorkerStatus = {
  service: "dang-worker";
  status: "ready_idle" | "consuming";
  queueAdapter: "none" | "redis";
  jobs: WorkerJobDefinition[];
  financeVerticalSlice: readonly FinanceVerticalSliceStep[];
};

export function getWorkerStatus(): WorkerStatus {
  const redis = isRedisConfigured(loadAppEnv());
  return {
    service: "dang-worker",
    status: redis ? "consuming" : "ready_idle",
    queueAdapter: redis ? "redis" : "none",
    jobs: workerJobCatalog,
    financeVerticalSlice: financeVerticalSliceSteps,
  };
}
