"use client";

import { useEffect, useState, useTransition } from "react";
import type { MembershipSummary, PersonalAddonChargeSummary } from "@dang/contracts";
import { Amount, Button, SelectField, TextField } from "@dang/ui";
import {
  DataList,
  DataRow,
  EmptyHint,
  FormStack,
  SectionCard,
} from "@/components/ui-blocks";
import { api } from "@/lib/api";
import { friendlyErrorMessage } from "@/lib/api-errors";
import { newClientId } from "@/lib/id";
import { tomanInputToIrrMinor } from "@/lib/irr-money";

type Props = {
  workspaceId: string;
  actorUserId: string | null;
  members: MembershipSummary[];
  /** Auditor/guest — list only. */
  readOnly?: boolean;
  onError: (message: string) => void;
  onSuccess: (message: string) => void;
};

const statusFa: Record<PersonalAddonChargeSummary["status"], string> = {
  pending_ack: "در انتظار تأیید",
  confirmed: "تأیید شده",
  disputed: "اعتراض",
};

/** Gated by ENABLE_ADDON_ACK / productFlags.addonAck — distinct from shared expense form. */
export function AddonChargesPanel({
  workspaceId,
  actorUserId,
  members,
  readOnly = false,
  onError,
  onSuccess,
}: Props) {
  const [charges, setCharges] = useState<PersonalAddonChargeSummary[]>([]);
  const [title, setTitle] = useState("");
  const [amountToman, setAmountToman] = useState("");
  const [targetUserId, setTargetUserId] = useState("");
  const [linkedExpenseId, setLinkedExpenseId] = useState("");
  const [sharedExpenses, setSharedExpenses] = useState<
    Array<{ id: string; title: string }>
  >([]);
  const [pending, startTransition] = useTransition();

  function reload() {
    return Promise.all([
      api.listAddonCharges(workspaceId),
      api.listExpenses(workspaceId).catch(() => []),
    ])
      .then(([chargeList, expenseList]) => {
        setCharges(chargeList);
        setSharedExpenses(
          expenseList
            .filter((e) => e.visibility === "shared")
            .map((e) => ({ id: e.id, title: e.title })),
        );
      })
      .catch((err: unknown) => onError(friendlyErrorMessage(err, "بارگذاری اضافه‌ها ناموفق")));
  }

  useEffect(() => {
    void reload();
  }, [workspaceId]);

  useEffect(() => {
    if (!targetUserId && members[0]) setTargetUserId(members[0].userId);
  }, [members, targetUserId]);

  function memberName(userId: string) {
    return members.find((m) => m.userId === userId)?.displayName ?? userId.slice(0, 8);
  }

  function onCreate() {
    const amount = tomanInputToIrrMinor(amountToman);
    if (!title.trim() || !amount || !targetUserId) {
      onError("عنوان، مبلغ تومان و عضو هدف را کامل کنید");
      return;
    }
    startTransition(() => {
      void (async () => {
        try {
          await api.createAddonCharge(workspaceId, {
            title: title.trim(),
            targetMemberUserId: targetUserId,
            amount,
            linkedExpenseId: linkedExpenseId || undefined,
            idempotencyKey: newClientId(),
          });
          setTitle("");
          setAmountToman("");
          setLinkedExpenseId("");
          onSuccess("اضافهٔ شخصی ثبت شد — تا تأیید، در صورتحساب قطعی نیست");
          await reload();
        } catch (err: unknown) {
          onError(friendlyErrorMessage(err, "ثبت اضافه ناموفق"));
        }
      })();
    });
  }

  function onConfirm(id: string) {
    startTransition(() => {
      void api
        .confirmAddonCharge(workspaceId, id)
        .then(async () => {
          onSuccess("اضافه تأیید شد");
          await reload();
        })
        .catch((err: unknown) => onError(friendlyErrorMessage(err, "تأیید ناموفق")));
    });
  }

  function onDispute(id: string) {
    startTransition(() => {
      void api
        .disputeAddonCharge(workspaceId, id, { note: "اعتراض از رابط گروه" })
        .then(async () => {
          onSuccess("اعتراض ثبت شد");
          await reload();
        })
        .catch((err: unknown) => onError(friendlyErrorMessage(err, "اعتراض ناموفق")));
    });
  }

  return (
    <SectionCard
      title="اضافهٔ شخصی داخل گروه"
      delayClass="delay1"
      className="uxAddonPanel"
    >
      <p className="liveHint">
        جدا از خرج مشترک — ۱۰۰٪ روی یک نفر؛ تا تأیید هدف، قطعی نیست.
      </p>
      {readOnly ? (
        <p className="liveHint">نقش شما فقط مشاهده دارد — ثبت یا تأیید اضافه فعال نیست.</p>
      ) : (
        <FormStack>
          <TextField
            label="شرح"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <TextField
            label="مبلغ (تومان)"
            value={amountToman}
            onChange={(e) => setAmountToman(e.target.value)}
          />
          <SelectField
            label="برای عضو"
            value={targetUserId}
            onChange={(e) => setTargetUserId(e.target.value)}
          >
            {members.map((m) => (
              <option key={m.userId} value={m.userId}>
                {m.displayName}
              </option>
            ))}
          </SelectField>
          <SelectField
            label="پیوند به خرج مشترک (اختیاری)"
            value={linkedExpenseId}
            onChange={(e) => setLinkedExpenseId(e.target.value)}
          >
            <option value="">بدون پیوند</option>
            {sharedExpenses.map((e) => (
              <option key={e.id} value={e.id}>
                {e.title}
              </option>
            ))}
          </SelectField>
          <Button type="button" onClick={onCreate} disabled={pending || members.length === 0}>
            ثبت اضافه
          </Button>
        </FormStack>
      )}
      {charges.length === 0 ? (
        <EmptyHint>هنوز اضافه‌ای ثبت نشده.</EmptyHint>
      ) : (
        <DataList>
          {charges.map((c) => (
            <DataRow
              key={c.id}
              title={c.title}
              meta={`${memberName(c.targetMemberUserId)} · ${statusFa[c.status]}`}
              trailing={
                <>
                  <Amount irrMinor={c.amount.amountMinor} />
                  {!readOnly &&
                  c.status === "pending_ack" &&
                  actorUserId &&
                  (actorUserId === c.targetMemberUserId ||
                    actorUserId === c.createdByUserId) ? (
                    <span className="dataRowActions">
                      {actorUserId === c.targetMemberUserId ? (
                        <>
                          <Button type="button" onClick={() => onConfirm(c.id)} disabled={pending}>
                            تأیید
                          </Button>
                          <Button type="button" onClick={() => onDispute(c.id)} disabled={pending}>
                            اعتراض
                          </Button>
                        </>
                      ) : null}
                    </span>
                  ) : null}
                </>
              }
            />
          ))}
        </DataList>
      )}
    </SectionCard>
  );
}
