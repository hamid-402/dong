import type { WorkspaceSummary, SystemCapabilities, HealthReadyResponse } from "@dang/contracts";
import { apiFetch } from "./client";

export type { SystemCapabilities, HealthReadyResponse };

export type PublicContactResponse = {
  accepted: true;
  delivered: boolean;
  mailerMode: "resend" | "smtp" | "dev-log" | "none";
  suggestMailto: boolean;
};

/** System capability, health and demo-seed endpoints — domain slice (dong-50 #30). */
export const systemApi = {
  capabilities: () => apiFetch<SystemCapabilities>("/system/capabilities"),
  healthReady: () => apiFetch<HealthReadyResponse>("/health/ready"),
  publicContact: (body: {
    name?: string;
    email?: string;
    topic: string;
    message: string;
  }) =>
    apiFetch<PublicContactResponse>("/public/contact", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  seedDemo: () =>
    apiFetch<{
      workspace: WorkspaceSummary;
      reused: boolean;
      persistence: Record<string, string>;
    }>("/demo/seed", {
      method: "POST",
      body: JSON.stringify({ confirm: "SEED_WORKSPACE_DEMO" }),
    }),
  seedColleaguesDemo: () =>
    apiFetch<{
      label: "دمو";
      workspace: WorkspaceSummary;
      reused: boolean;
      expense: { id: string; title: string; total: { amountMinor: string } };
      invoices: Array<{ id: string; memberUserId: string; totalMinor: string }>;
    }>("/demo/seed/colleagues", {
      method: "POST",
      body: JSON.stringify({ confirm: "SEED_COLLEAGUES_DEMO" }),
    }),
  purgeColleaguesDemo: () =>
    apiFetch<{
      label: "دمو";
      purgedWorkspaceIds: string[];
    }>("/demo/seed/colleagues", {
      method: "DELETE",
      body: JSON.stringify({ confirm: "PURGE_COLLEAGUES_DEMO" }),
    }),
  purgeAftabDemo: () =>
    apiFetch<{
      label: "دمو";
      purgedWorkspaceIds: string[];
    }>("/demo/seed/aftab", {
      method: "DELETE",
      body: JSON.stringify({ confirm: "PURGE_AFTAB_DEMO" }),
    }),
};
