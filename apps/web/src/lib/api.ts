import {
  API_BASE,
  ApiError,
  authApi,
  clearClientSession,
  DEV_IDENTITY_DEFAULTS,
  encodeDevHeader,
  getAuthClientMode,
  getDevIdentity,
  markClientSession,
  setDevIdentity,
  type AuditEventDto,
  type AuthClientMode,
} from "./api/client";
import { assetsApi } from "./api/assets";
import { allowancesApi } from "./api/allowances";
import { approvalQueueApi } from "./api/approval-queue";
import { addonChargesApi } from "./api/addon-charges";
import { attachmentsApi } from "./api/attachments";
import { billingApi } from "./api/billing";
import { costCentersApi } from "./api/cost-centers";
import { dailyLedgerApi } from "./api/daily-ledger";
import { expensesApi } from "./api/expenses";
import { fxRatesApi } from "./api/fx-rates";
import { waveFApi } from "./api/wave-f";
import { partnershipApi } from "./api/partnership";
import { personalFinanceApi } from "./api/personal-finance";
import { procurementApi } from "./api/procurement";
import { proposalsApi } from "./api/proposals";
import { reportsApi } from "./api/reports";
import { settlementsApi } from "./api/settlements";
import { systemApi } from "./api/system";
import { workspacesApi } from "./api/workspaces";

export {
  API_BASE,
  ApiError,
  clearClientSession,
  DEV_IDENTITY_DEFAULTS,
  encodeDevHeader,
  getAuthClientMode,
  getDevIdentity,
  markClientSession,
  setDevIdentity,
  type AuditEventDto,
  type AuthClientMode,
};

export type { SystemCapabilities, HealthReadyResponse } from "./api/system";

/**
 * Aggregated API surface — composed from domain slices (dong-50 #30).
 * Callers import from `@/lib/api`; the shape stays identical to the legacy
 * monolithic object. Add new methods to the relevant domain module.
 */
export const api = {
  ...authApi,
  ...allowancesApi,
  ...approvalQueueApi,
  ...expensesApi,
  ...fxRatesApi,
  ...waveFApi,
  ...personalFinanceApi,
  ...workspacesApi,
  ...settlementsApi,
  ...dailyLedgerApi,
  ...billingApi,
  ...costCentersApi,
  ...reportsApi,
  ...attachmentsApi,
  ...proposalsApi,
  ...procurementApi,
  ...assetsApi,
  ...partnershipApi,
  ...addonChargesApi,
  ...systemApi,
};
