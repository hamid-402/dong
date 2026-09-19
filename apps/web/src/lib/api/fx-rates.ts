import type {
  CreateFxRateRequest,
  FxConvertPreviewRequest,
  FxConvertPreviewResponse,
  FxRateSummary,
} from "@dang/contracts";
import { apiFetch } from "./client";

/** Global FX rate table — conversion posting is intentionally not live. */
export const fxRatesApi = {
  listFxRates: () => apiFetch<FxRateSummary[]>("/fx-rates"),
  createFxRate: (body: CreateFxRateRequest) =>
    apiFetch<FxRateSummary>("/fx-rates", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  syncFxProvider: () =>
    apiFetch<{ imported: number; source: string }>("/fx-rates/sync-provider", {
      method: "POST",
      body: "{}",
    }),
  previewFxConvert: (body: FxConvertPreviewRequest) =>
    apiFetch<FxConvertPreviewResponse>("/fx-rates/preview", {
      method: "POST",
      body: JSON.stringify(body),
    }),
};
