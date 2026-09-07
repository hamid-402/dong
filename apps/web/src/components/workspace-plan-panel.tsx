"use client";

import { useEffect, useState, useTransition } from "react";
import type { ProductFeatureFlags, WorkspacePlanName, WorkspacePlanSummary } from "@dang/contracts";
import { Button, SelectField } from "@dang/ui";
import { FormStack, SectionCard, StatusLine } from "@/components/ui-blocks";
import { api } from "@/lib/api";
import { friendlyErrorMessage } from "@/lib/api-errors";

const PLAN_LABEL: Record<WorkspacePlanName, string> = {
  free: "رایگان",
  pro: "Pro",
  business: "Business",
};

/** Honest plan storage UI — no charging; gated by workspacePlans / planAdmin. */
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
  const [pending, startTransition] = useTransition();
  const canAdmin =
    flags.planAdmin || (flags.workspacePlans && myRole === "owner");

  useEffect(() => {
    if (!flags.workspacePlans && !flags.planAdmin) return;
    void api
      .getWorkspacePlan(workspaceId)
      .then((row) => {
        setPlan(row);
        setDraft(row.plan);
      })
      .catch((err: unknown) =>
        onError(friendlyErrorMessage(err, "بارگذاری پلن ناموفق")),
      );
  }, [workspaceId, flags.workspacePlans, flags.planAdmin, onError]);

  if (!flags.workspacePlans && !flags.planAdmin) return null;

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

  return (
    <SectionCard title="پلن فضای کاری" tone="quiet">
      <StatusLine>
        فقط ذخیرهٔ پلن در سرور — شارژ اشتراک و درگاه پرداخت فعال نیست.
      </StatusLine>
      {plan ? (
        <StatusLine>
          پلن فعلی: {PLAN_LABEL[plan.plan]}
          {plan.seatsLimit != null ? ` · سقف صندلی ${plan.seatsLimit}` : ""}
          {plan.updatedAt ? ` · ${plan.updatedAt}` : ""}
        </StatusLine>
      ) : (
        <StatusLine>در حال بارگذاری…</StatusLine>
      )}
      {canAdmin ? (
        <FormStack>
          <SelectField
            label="پلن"
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
    </SectionCard>
  );
}
