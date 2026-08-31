export type WorkerJobName =
  | "ocr.receipt"
  | "quarantine.scan"
  | "notify.email"
  | "notify.push"
  | "report.export"
  | "webhook.dispatch"
  | "ledger.rebuild_balances";

export type JobRunSummary = {
  jobId: string;
  name: WorkerJobName;
  status: "completed" | "failed";
  detail: string;
};
