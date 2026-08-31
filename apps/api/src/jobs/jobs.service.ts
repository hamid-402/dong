import { Injectable } from "@nestjs/common";
import type { WorkerJobName } from "@dang/contracts";

export type JobRunResult = {
  jobId: string;
  name: WorkerJobName;
  status: "completed";
  detail: string;
};

@Injectable()
export class JobsService {
  private readonly runs: JobRunResult[] = [];

  run(
    name: WorkerJobName,
    workspaceId: string,
    meta?: Record<string, string>,
  ): JobRunResult {
    const jobId = crypto.randomUUID();
    let detail: string;
    switch (name) {
      case "ledger.rebuild_balances":
        detail = `Rebuilt balance projection for workspace ${workspaceId}`;
        break;
      case "notify.email":
        detail = `Queued email notifications for workspace ${workspaceId}`;
        break;
      case "notify.push":
        detail = `Queued push notifications for workspace ${workspaceId}`;
        break;
      case "ocr.receipt":
        detail = meta?.attachmentId
          ? `OCR receipt job for attachment ${meta.attachmentId}`
          : `OCR receipt job accepted for workspace ${workspaceId}`;
        break;
      case "quarantine.scan":
        detail = meta?.attachmentId
          ? `Quarantine scan for attachment ${meta.attachmentId}`
          : `Quarantine scan for workspace ${workspaceId}`;
        break;
      default:
        detail = `Job ${name} accepted`;
    }
    const result: JobRunResult = { jobId, name, status: "completed", detail };
    this.runs.push(result);
    return result;
  }

  listRecent(): JobRunResult[] {
    return this.runs.slice(-20);
  }
}
