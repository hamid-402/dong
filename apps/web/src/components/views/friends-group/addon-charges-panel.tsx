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
  StatusPill,
} from "@/components/ui-blocks";
import { api } from "@/lib/api";
import { friendlyErrorMessage } from "@/lib/api-errors";
import { newClientId } from "@/lib/id";
import { tomanInputToIrrMinor } from "@/lib/irr-money";
import styles from "./addon-charges-panel.module.css";

type Props = {
  workspaceId: string;
  actorUserId: string | null;
  members: MembershipSummary[];
  /** Auditor/guest — list only. */
  readOnly?: boolean;
  onError: (message: string) => void;
  onSuccess: (message: string) => void;
  onChargesChange?: (charges: PersonalAddonChargeSummary[]) => void;
};

const statusFa: Record<PersonalAddonChargeSummary["status"], string> = {
  pending_ack: "در انتظار تأیید",
  confirmed: "تأیید شده",
  disputed: "اعتراض",
};

function statusTone(
  status: PersonalAddonChargeSummary["status"],
): "ok" | "warn" | "neutral" {
  if (status === "confirmed") return "ok";
  if (status === "disputed") return "warn";
  return "neutral";
}

function formatWhen(iso: string): string {
  try {
    return new Intl.DateTimeFormat("fa-IR", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

/** Gated by ENABLE_ADDON_ACK / productFlags.addonAck — distinct from shared expense form. */
export function AddonChargesPanel({
  workspaceId,
  actorUserId,
  members,
  readOnly = false,
  onError,
  onSuccess,
  onChargesChange,
}: Props) {
  const [charges, setCharges] = useState<PersonalAddonChargeSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [amountToman, setAmountToman] = useState("");
  const [targetUserId, setTargetUserId] = useState("");
  const [linkedExpenseId, setLinkedExpenseId] = useState("");
  const [sharedExpenses, setSharedExpenses] = useState<
    Array<{ id: string; title: string }>
  >([]);
  const [pending, startTransition] = useTransition();

  function applyCharges(next: PersonalAddonChargeSummary[]) {
    setCharges(next);
    onChargesChange?.(next);
    setSelectedId((current) =>
      current && next.some((charge) => charge.id === current)
        ? current
        : next[0]?.id ?? null,
    );
  }

  function reload() {
    return Promise.all([
      api.listAddonCharges(workspaceId),
      api.listExpenses(workspaceId).catch(() => []),
    ])
      .then(([chargeList, expenseList]) => {
        applyCharges(chargeList);
        setSharedExpenses(
          expenseList
            .filter((expense) => expense.visibility === "shared")
            .map((expense) => ({ id: expense.id, title: expense.title })),
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
    return members.find((member) => member.userId === userId)?.displayName ?? userId.slice(0, 8);
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

  const selected = charges.find((charge) => charge.id === selectedId) ?? null;
  const canActOnSelected =
    !readOnly &&
    selected?.status === "pending_ack" &&
    actorUserId &&
    (actorUserId === selected.targetMemberUserId ||
      actorUserId === selected.createdByUserId);

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
            onChange={(event) => setTitle(event.target.value)}
          />
          <TextField
            label="مبلغ (تومان)"
            value={amountToman}
            onChange={(event) => setAmountToman(event.target.value)}
          />
          <SelectField
            label="برای عضو"
            value={targetUserId}
            onChange={(event) => setTargetUserId(event.target.value)}
          >
            {members.map((member) => (
              <option key={member.userId} value={member.userId}>
                {member.displayName}
              </option>
            ))}
          </SelectField>
          <SelectField
            label="پیوند به خرج مشترک (اختیاری)"
            value={linkedExpenseId}
            onChange={(event) => setLinkedExpenseId(event.target.value)}
          >
            <option value="">بدون پیوند</option>
            {sharedExpenses.map((expense) => (
              <option key={expense.id} value={expense.id}>
                {expense.title}
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
        <div className={styles.masterDetail}>
          <DataList>
            {charges.map((charge) => (
              <div
                key={charge.id}
                className={charge.id === selectedId ? styles.selectedRow : undefined}
              >
                <DataRow
                  title={charge.title}
                  meta={`${memberName(charge.targetMemberUserId)} · ${statusFa[charge.status]}`}
                  trailing={
                    <>
                      <Amount irrMinor={charge.amount.amountMinor} />
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => setSelectedId(charge.id)}
                      >
                        جزئیات
                      </Button>
                      {!readOnly &&
                      charge.status === "pending_ack" &&
                      actorUserId &&
                      actorUserId === charge.targetMemberUserId ? (
                        <span className="dataRowActions">
                          <Button
                            type="button"
                            onClick={() => onConfirm(charge.id)}
                            disabled={pending}
                          >
                            تأیید
                          </Button>
                          <Button
                            type="button"
                            onClick={() => onDispute(charge.id)}
                            disabled={pending}
                          >
                            اعتراض
                          </Button>
                        </span>
                      ) : null}
                    </>
                  }
                />
              </div>
            ))}
          </DataList>

          <aside className={styles.inspector} aria-label="جزئیات اضافه انتخاب‌شده">
            {selected ? (
              <>
                <span>بازرس اضافه شخصی</span>
                <h3>{selected.title}</h3>
                <StatusPill tone={statusTone(selected.status)}>
                  {statusFa[selected.status]}
                </StatusPill>
                <dl>
                  <div>
                    <dt>مبلغ</dt>
                    <dd>
                      <Amount irrMinor={selected.amount.amountMinor} />
                    </dd>
                  </div>
                  <div>
                    <dt>عضو هدف</dt>
                    <dd>{memberName(selected.targetMemberUserId)}</dd>
                  </div>
                  <div>
                    <dt>ثبت‌کننده</dt>
                    <dd>{memberName(selected.createdByUserId)}</dd>
                  </div>
                  <div>
                    <dt>پیوند خرج</dt>
                    <dd>
                      {selected.linkedExpenseId
                        ? sharedExpenses.find((expense) => expense.id === selected.linkedExpenseId)
                            ?.title ?? selected.linkedExpenseId
                        : "بدون پیوند"}
                    </dd>
                  </div>
                  <div>
                    <dt>ایجاد</dt>
                    <dd>{formatWhen(selected.createdAt)}</dd>
                  </div>
                  <div>
                    <dt>به‌روزرسانی</dt>
                    <dd>{formatWhen(selected.updatedAt)}</dd>
                  </div>
                  <div>
                    <dt>یادداشت</dt>
                    <dd>{selected.note?.trim() || "ثبت نشده"}</dd>
                  </div>
                </dl>
                {canActOnSelected && actorUserId === selected.targetMemberUserId ? (
                  <div className={styles.inspectorActions}>
                    <Button
                      type="button"
                      onClick={() => onConfirm(selected.id)}
                      disabled={pending}
                    >
                      تأیید
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => onDispute(selected.id)}
                      disabled={pending}
                    >
                      اعتراض
                    </Button>
                  </div>
                ) : null}
                {readOnly ? (
                  <p className="liveHint">نقش فقط‌خواندنی — اقدام تغییر غیرفعال است.</p>
                ) : null}
              </>
            ) : (
              <EmptyHint>برای مشاهده جزئیات، یک اضافه را انتخاب کنید.</EmptyHint>
            )}
          </aside>
        </div>
      )}
    </SectionCard>
  );
}
