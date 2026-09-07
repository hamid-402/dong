import type { WorkspaceSummary, SystemCapabilities, HealthReadyResponse } from "@dang/contracts";
import { apiFetch } from "./client";

export type { SystemCapabilities, HealthReadyResponse };

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
