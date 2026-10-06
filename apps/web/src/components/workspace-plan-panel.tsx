"use client";

import { useEffect, useState, useTransition } from "react";
import type {
  ProductFeatureFlags,
  SaasUsageSnapshot,
  SubscriptionInvoiceSummary,
  WorkspacePlanName,
  WorkspacePlanSummary,
} from "@dang/contracts";
import { Button, SelectField } from "@dang/ui";
import { FormStack, SectionCard, StatusLine } from "@/components/ui-blocks";
import { api } from "@/lib/api";
import { friendlyErrorMessage } from "@/lib/api-errors";
import { newClientId } from "@/lib/id";

const PLAN_LABEL: Record<WorkspacePlanName, string> = {
  free: "رایگان",
  pro: "Pro",
  business: "Business",
};

function formatMinorToman(minor: string): string {
  try {
    return new Intl.NumberFormat("fa-IR").format(Number(BigInt(minor) / 10n));
  } catch {
    return minor;
  }
}

/** Plan admin + real SaaS metering (R10-21). Pay when LocalPSP or Zarinpal live. */
export function WorkspacePlanPanel({
  workspaceId,
  flags,
  myRole,
  onError,
}: {
  workspaceId: string;
  flags: ProductFeatureFlags;
  myRole: string;
  onError: (message: string | null) => void;
}) {
  const [plan, setPlan] = useState<WorkspacePlanSummary | null>(null);
  const [draft, setDraft] = useState<WorkspacePlanName>("free");
  const [usage, setUsage] = useState<SaasUsageSnapshot | null>(null);
  const [invoices, setInvoices] = useState<SubscriptionInvoiceSummary[]>([]);
  const [invoicePlan, setInvoicePlan] = useState<"pro" | "business">("pro");
  const [paymentsLive, setPaymentsLive] = useState(false);
  const [paymentProvider, setPaymentProvider] = useState<string>("local_psp");
  const [saasBillingOn, setSaasBillingOn] = useState(false);
  const [pending, startTransition] = useTransition();

  const canAdmin =
    flags.planAdmin || (flags.workspacePlans && myRole === "owner");
  const canFinance =
    myRole === "owner" || myRole === "admin" || myRole === "finance";
  const showPlanAdmin = flags.workspacePlans || flags.planAdmin;

  useEffect(() => {
    void api.capabilities().then((caps) => {
      const mode = caps.providers?.payment ?? "local_psp";
      setPaymentProvider(mode);
      setPaymentsLive(mode === "local_psp" || mode === "zarinpal");
      setSaasBillingOn(caps.providers?.saasBilling === "metering_v1");
    });
  }, []);

  useEffect(() => {
    if (showPlanAdmin) {
      void api
        .getWorkspacePlan(workspaceId)
        .then((row) => {
          setPlan(row);
          setDraft(row.plan);
        })
        .catch((err: unknown) =>
          onError(friendlyErrorMessage(err, "بارگذاری پلن ناموفق")),
        );
    }
  }, [workspaceId, showPlanAdmin, onError]);

  useEffect(() => {
    if (!saasBillingOn || !canFinance) {
      setUsage(null);
      setInvoices([]);
      return;
    }
    void api
      .saasUsage(workspaceId)
      .then(setUsage)
      .catch(() => setUsage(null));
    void api
      .listSaasInvoices(workspaceId)
      .then(setInvoices)
      .catch(() => setInvoices([]));
  }, [workspaceId, saasBillingOn, canFinance]);

  if (!showPlanAdmin && !saasBillingOn) return null;

  function save() {
    startTransition(() => {
      void api
        .putWorkspacePlan(workspaceId, { plan: draft })
        .then((row) => {
          setPlan(row);
          setDraft(row.plan);
          onError(null);
        })
        .catch((err: unknown) =>
          onError(friendlyErrorMessage(err, "ذخیره پلن ناموفق")),
        );
    });
  }

  function issueInvoice() {
    if (!usage) return;
    startTransition(() => {
      void api
        .createSaasInvoice(workspaceId, {
          targetPlan: invoicePlan,
          periodMonth: usage.periodMonth,
          idempotencyKey: newClientId(),
        })
        .then((row) => {
          setInvoices((prev) => [row, ...prev.filter((x) => x.id !== row.id)]);
          onError(null);
        })
        .catch((err: unknown) =>
          onError(friendlyErrorMessage(err, "صدور صورتحساب اشتراک ناموفق")),
        );
    });
  }

  function payInvoice(invoiceId: string) {
    startTransition(() => {
      void api
        .paySaasInvoice(workspaceId, invoiceId, {
          returnUrl: window.location.href,
          idempotencyKey: newClientId(),
        })
        .then(({ paymentLink }) => {
          onError(null);
          window.location.assign(paymentLink.checkoutUrl);
        })
        .catch((err: unknown) =>
          onError(friendlyErrorMessage(err, "شروع پرداخت اشتراک ناموفق")),
        );
    });
  }

  return (
    <SectionCard title="پلن فضا (اداری)" tone="quiet">
      <StatusLine>
        همهٔ قابلیت‌های محصول رایگان‌اند — پلن فقط برچسب مدیریتی است؛ قفل پرمیوم
        اعمال نمی‌شود.
      </StatusLine>

      {showPlanAdmin ? (
        plan ? (
          <StatusLine>
            پلن فعلی: {PLAN_LABEL[plan.plan]}
            {plan.seatsLimit != null ? ` · سقف صندلی ${plan.seatsLimit}` : ""}
          </StatusLine>
        ) : (
          <StatusLine>در حال بارگذاری پلن…</StatusLine>
        )
      ) : null}

      {saasBillingOn && canFinance ? (
        usage ? (
          <StatusLine>
            مصرف {usage.periodMonth}: {usage.seatsUsed.toLocaleString("fa-IR")} عضو ·{" "}
            {usage.postedExpensesInPeriod.toLocaleString("fa-IR")} خرج posted · پلن{" "}
            {PLAN_LABEL[usage.currentPlan]}
          </StatusLine>
        ) : (
          <StatusLine>در حال خواندن metering…</StatusLine>
        )
      ) : null}

      {saasBillingOn ? (
        <StatusLine>
          PSP:{" "}
          {paymentProvider === "zarinpal"
            ? "زرین‌پال فعال — پرداخت اشتراک مجاز"
            : paymentProvider === "local_psp"
              ? "LocalPSP — پرداخت اشتراک مجاز"
              : "پرداخت آنلاین در دسترس نیست"}
        </StatusLine>
      ) : null}

      {canAdmin && showPlanAdmin ? (
        <FormStack>
          <SelectField
            label="پلن (اداری)"
            value={draft}
            onChange={(e) => setDraft(e.target.value as WorkspacePlanName)}
            disabled={pending}
          >
            {(Object.keys(PLAN_LABEL) as WorkspacePlanName[]).map((key) => (
              <option key={key} value={key}>
                {PLAN_LABEL[key]}
              </option>
            ))}
          </SelectField>
          <Button type="button" onClick={save} disabled={pending || !plan}>
            ذخیره پلن
          </Button>
        </FormStack>
      ) : null}

      {saasBillingOn && canFinance ? (
        <FormStack>
          <SelectField
            label="صدور صورتحساب اشتراک"
            value={invoicePlan}
            onChange={(e) => setInvoicePlan(e.target.value as "pro" | "business")}
            disabled={pending}
          >
            <option value="pro">Pro</option>
            <option value="business">Business</option>
          </SelectField>
          <Button type="button" onClick={issueInvoice} disabled={pending || !usage}>
            صدور صورتحساب از کاتالوگ
          </Button>
        </FormStack>
      ) : null}

      {invoices.length > 0 ? (
        <ul style={{ listStyle: "none", padding: 0, marginTop: "0.75rem" }}>
          {invoices.map((inv) => (
            <li key={inv.id} style={{ marginBottom: "0.5rem" }}>
              <StatusLine>
                {PLAN_LABEL[inv.targetPlan]} · {inv.periodMonth} ·{" "}
                {formatMinorToman(inv.amount.amountMinor)} تومان · {inv.status}
                {inv.payable && paymentsLive ? (
                  <>
                    {" "}
                    <Button
                      type="button"
                      onClick={() => payInvoice(inv.id)}
                      disabled={pending}
                    >
                      پرداخت آنلاین
                    </Button>
                  </>
                ) : null}
              </StatusLine>
              <small style={{ opacity: 0.8 }}>{inv.note}</small>
            </li>
          ))}
        </ul>
      ) : null}
    </SectionCard>
  );
}
