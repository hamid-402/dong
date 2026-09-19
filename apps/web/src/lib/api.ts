import {
  API_BASE,
  ApiError,
  authApi,
  bootstrapDevSession,
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
import { activityApi } from "./api/activity";
import { allowancesApi } from "./api/allowances";
import { approvalQueueApi } from "./api/approval-queue";
import { addonChargesApi } from "./api/addon-charges";
import { attachmentsApi } from "./api/attachments";
import { billingApi } from "./api/billing";
import { buildingChargesApi } from "./api/building-charges";
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
import { reportViewsApi } from "./api/report-views";
import { settlementsApi } from "./api/settlements";
import { jobsApi } from "./api/jobs";
import { socialApi } from "./api/social";
import { permissionsApi } from "./api/permissions";
import { catalogApi } from "./api/catalog";
import { chartsApi } from "./api/charts";
import { statementsApi } from "./api/statements";
import { systemApi } from "./api/system";
import { workspacesApi } from "./api/workspaces";
import { workspacePaymentsApi } from "./api/workspace-payments";
import { platformApi } from "./api/platform";
import { securityEventsApi } from "./api/security-events";
import { vaultApi } from "./api/vault";
import { webhooksApi } from "./api/webhooks";

export {
  API_BASE,
  ApiError,
  bootstrapDevSession,
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
export type {
  DlqListResultDto,
  DlqReplayResultDto,
  JobRunResultDto,
} from "./api/jobs";

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
  ...buildingChargesApi,
  ...costCentersApi,
  ...reportsApi,
  ...reportViewsApi,
  ...attachmentsApi,
  ...proposalsApi,
  ...procurementApi,
  ...assetsApi,
  ...activityApi,
  ...partnershipApi,
  ...addonChargesApi,
  ...jobsApi,
  ...socialApi,
  ...permissionsApi,
  ...catalogApi,
  ...chartsApi,
  ...statementsApi,
  ...workspacePaymentsApi,
  ...platformApi,
  ...securityEventsApi,
  ...vaultApi,
  ...webhooksApi,
  ...systemApi,
};
