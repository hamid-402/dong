import type { CreateFxRateRequest, FxRateSummary } from "@dang/contracts";
import { apiFetch } from "./client";

/** Global FX rate table — conversion is intentionally not live. */
export const fxRatesApi = {
  listFxRates: () => apiFetch<FxRateSummary[]>("/fx-rates"),
  createFxRate: (body: CreateFxRateRequest) =>
    apiFetch<FxRateSummary>("/fx-rates", {
      method: "POST",
      body: JSON.stringify(body),
    }),
};
