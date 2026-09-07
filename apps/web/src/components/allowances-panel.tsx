"use client";

import { useEffect, useState, useTransition } from "react";
import type { MemberAllowanceUsage, MembershipSummary } from "@dang/contracts";
import { Amount, Button, SelectField, TextField } from "@dang/ui";
import { DataList, DataRow, EmptyHint, FormStack, SectionCard } from "@/components/ui-blocks";
import { api } from "@/lib/api";
import { friendlyErrorMessage } from "@/lib/api-errors";
import { newClientId } from "@/lib/id";

export function AllowancesPanel({
  workspaceId,
  members,
  onError,
  onSuccess,
}: {
  workspaceId: string;
  members: MembershipSummary[];
  onError: (message: string | null) => void;
  onSuccess: (message: string) => void;
}) {
  const [rows, setRows] = useState<MemberAllowanceUsage[]>([]);
  const [memberUserId, setMemberUserId] = useState("");
  const [periodKind, setPeriodKind] = useState<"week" | "month">("month");
  const [limitMinor, setLimitMinor] = useState("");
  const [pending, startTransition] = useTransition();

  function refresh() {
    return api.getAllowanceUsage(workspaceId).then(setRows);
  }

  useEffect(() => {
    setMemberUserId((current) => current || members[0]?.userId || "");
    void refresh().catch((error: unknown) =>
      onError(friendlyErrorMessage(error, "بارگذاری سقف اعضا ناموفق")),
    );
  }, [workspaceId, members]);

  function create() {
    if (!memberUserId || !/^\d+$/.test(limitMinor) || BigInt(limitMinor) <= 0n) {
      onError("عضو و سقف مثبت را وارد کنید");
      return;
    }
    startTransition(() => {
      void api
        .createAllowance(workspaceId, {
          memberUserId,
          periodKind,
          limit: { amountMinor: limitMinor, currency: "IRR" },
          alertPct: 80,
          idempotencyKey: newClientId(),
        })
        .then(async () => {
          setLimitMinor("");
          onSuccess("سقف هزینه عضو ثبت شد");
          await refresh();
        })
        .catch((error: unknown) =>
          onError(friendlyErrorMessage(error, "ثبت سقف ناموفق")),
        );
    });
  }

  const memberName = (userId: string) =>
    members.find((member) => member.userId === userId)?.displayName ??
    userId.slice(0, 8);

  return (
    <SectionCard title="سقف هزینه اعضا" badge={rows.length}>
      <FormStack density="compact">
        <SelectField
          label="عضو"
          value={memberUserId}
          onChange={(event) => setMemberUserId(event.target.value)}
        >
          {members.map((member) => (
            <option key={member.userId} value={member.userId}>
              {member.displayName}
            </option>
          ))}
        </SelectField>
        <SelectField
          label="دوره"
          value={periodKind}
          onChange={(event) =>
            setPeriodKind(event.target.value as "week" | "month")
          }
        >
          <option value="week">هفتگی</option>
          <option value="month">ماهانه</option>
        </SelectField>
        <TextField
          label="سقف (ریال)"
          inputMode="numeric"
          value={limitMinor}
          onChange={(event) => setLimitMinor(event.target.value)}
        />
        <Button type="button" disabled={pending || members.length === 0} onClick={create}>
          ثبت سقف
        </Button>
      </FormStack>
      {rows.length === 0 ? (
        <EmptyHint>برای عضوی سقف فعالی ثبت نشده است.</EmptyHint>
      ) : (
        <DataList>
          {rows.map((row) => (
            <DataRow
              key={row.id}
              title={`${memberName(row.memberUserId)} · ${
                row.periodKind === "week" ? "هفتگی" : "ماهانه"
              }`}
              meta={
                row.alertReached
                  ? `هشدار ${row.alertPct}٪ عبور کرده`
                  : `از ${row.periodStartsOn}`
              }
              trailing={
                <span>
                  <Amount irrMinor={row.spent.amountMinor} /> /{" "}
                  <Amount irrMinor={row.limit.amountMinor} />
                </span>
              }
            />
          ))}
        </DataList>
      )}
    </SectionCard>
  );
}
