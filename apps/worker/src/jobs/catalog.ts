import type { FinanceVerticalSliceStep, WorkerJobName } from "@dang/contracts";
import { financeVerticalSliceSteps } from "@dang/contracts";

export type { WorkerJobName };
export type WorkerJobDefinition = {
  name: WorkerJobName;
  descriptionFa: string;
  /** Phase when the adapter becomes active. */
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
    descriptionFa: "اسکن قرنطینه فایل (AV stub)",
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
  status: "ready_idle";
  queueAdapter: "none";
  jobs: WorkerJobDefinition[];
  financeVerticalSlice: readonly FinanceVerticalSliceStep[];
};

export function getWorkerStatus(): WorkerStatus {
  return {
    service: "dang-worker",
    status: "ready_idle",
    queueAdapter: "none",
    jobs: workerJobCatalog,
    financeVerticalSlice: financeVerticalSliceSteps,
  };
}
