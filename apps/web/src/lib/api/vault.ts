import type {
  VaultRotateMasterResponse,
  VaultRotateResponse,
  VaultStatusResponse,
} from "@dang/contracts";
import { apiFetch } from "./client";

export const vaultApi = {
  vaultStatus: () => apiFetch<VaultStatusResponse>("/vault/status"),
  vaultSeal: () =>
    apiFetch<VaultStatusResponse>("/vault/seal", {
      method: "POST",
      body: "{}",
    }),
  vaultUnseal: () =>
    apiFetch<VaultStatusResponse>("/vault/unseal", {
      method: "POST",
      body: "{}",
    }),
  vaultRotateSecret: (name: string) =>
    apiFetch<VaultRotateResponse>(`/vault/rotate/${encodeURIComponent(name)}`, {
      method: "POST",
      body: "{}",
    }),
  vaultRotateMaster: () =>
    apiFetch<VaultRotateMasterResponse>("/vault/rotate-master", {
      method: "POST",
      body: "{}",
    }),
};
