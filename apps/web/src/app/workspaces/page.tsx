"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import type {
  ExpenseSummary,
  JournalEntrySummary,
  MembershipSummary,
  PaymentLinkSummary,
  SessionSummary,
  SettlementSummary,
  SplitMethod,
  WorkspaceBalancesResponse,
  WorkspaceSummary,
} from "@dang/contracts";
import { allocateEqualSplit } from "@dang/contracts";
import { Amount, Button, SelectField, TextField, formatToman } from "@dang/ui";
import { AppShell, ShellIconSvg } from "@/components/app-shell";
import {
  DataList,
  DataRow,
  EmptyHint,
  FormStack,
  HeroBalance,
  PageHeader,
  ProductGrid,
  QuickAction,
  SectionCard,
  StatusPill,
} from "@/components/ui-blocks";
import { api, DEV_IDENTITY_DEFAULTS, getDevIdentity, setDevIdentity, type AuditEventDto } from "@/lib/api";
import {
  listOfflineExpenseDrafts,
  removeOfflineExpenseDraft,
  saveOfflineExpenseDraft,
  type OfflineExpenseDraft,
} from "@/lib/offline-drafts";
async function loadWorkspaceData(workspaceId: string) {
  const [expenses, settlements, auditEvents, members, balances, ledgerEntries, paymentLinks] =
    await Promise.all([
      api.listExpenses(workspaceId),
      api.listSettlements(workspaceId),
      api.listAuditEvents(workspaceId),
      api.listMembers(workspaceId),
      api.getBalances(workspaceId),
      api.listLedgerEntries(workspaceId),
      api.listPaymentLinks(workspaceId).catch(() => [] as PaymentLinkSummary[]),
    ]);
  return { expenses, settlements, auditEvents, members, balances, ledgerEntries, paymentLinks };
}
export default function WorkspacesHomePage() {
  const router = useRouter();
  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [members, setMembers] = useState<MembershipSummary[]>([]);
  const [expenses, setExpenses] = useState<ExpenseSummary[]>([]);
  const [settlements, setSettlements] = useState<SettlementSummary[]>([]);
  const [paymentLinks, setPaymentLinks] = useState<PaymentLinkSummary[]>([]);
  const [balances, setBalances] = useState<WorkspaceBalancesResponse | null>(null);
  const [ledgerEntries, setLedgerEntries] = useState<JournalEntrySummary[]>([]);
  const [auditEvents, setAuditEvents] = useState<AuditEventDto[]>([]);
  const [session, setSession] = useState<SessionSummary | null>(null);
  const [devSubject, setDevSubject] = useState<string>(DEV_IDENTITY_DEFAULTS.subject);
  const [devDisplayName, setDevDisplayName] = useState<string>(DEV_IDENTITY_DEFAULTS.displayName);
  const [title, setTitle] = useState("خرید مصالح");
  const [splitMethod, setSplitMethod] = useState<SplitMethod>("equal");
  const [amountToman, setAmountToman] = useState("1250000");
  const [participantIds, setParticipantIds] = useState<string[]>([]);
  const [settleToUserId, setSettleToUserId] = useState("");
  const [settleAmountToman, setSettleAmountToman] = useState("250000");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [offlineDrafts, setOfflineDrafts] = useState<OfflineExpenseDraft[]>([]);
  const previewSplits = useMemo(() => {
    const toman = Number(amountToman.replaceAll(",", ""));
    if (!Number.isFinite(toman) || toman <= 0 || participantIds.length === 0) {
      return [];
    }
    try {
      return allocateEqualSplit(
        { amountMinor: String(Math.round(toman) * 10), currency: "IRR" },
        participantIds,
      );
    } catch {
      return [];
    }
  }, [amountToman, participantIds]);
  function applyWorkspaceData(data: Awaited<ReturnType<typeof loadWorkspaceData>>) {
    setExpenses(data.expenses);
    setSettlements(data.settlements);
    setPaymentLinks(data.paymentLinks);
    setAuditEvents(data.auditEvents);
    setMembers(data.members);
    setBalances(data.balances);
    setLedgerEntries(data.ledgerEntries);
    setParticipantIds((prev) => {
      const valid = new Set(data.members.map((member) => member.userId));
      const kept = prev.filter((id) => valid.has(id));
      if (kept.length > 0) return kept;
      return data.members.map((member) => member.userId);
    });
    setSettleToUserId((prev) => {
      if (prev && data.members.some((member) => member.userId === prev)) return prev;
      return (
        data.members.find((member) => member.userId !== data.members[0]?.userId)?.userId ??
        data.members[0]?.userId ??
        ""
      );
    });
  }
  function refresh() {
    startTransition(() => {
      void (async () => {
        try {
          setDevIdentity(devSubject.trim() || "dev-local-user", devDisplayName.trim() || "کاربر محلی");
          const [list, nextSession] = await Promise.all([api.listWorkspaces(), api.session()]);
          setSession(nextSession);
          setWorkspaces(list);
          const nextId =
            selectedId && list.some((item) => item.id === selectedId)
              ? selectedId
              : (list[0]?.id ?? "");
          setSelectedId(nextId);
          if (nextId) {
            applyWorkspaceData(await loadWorkspaceData(nextId));
            setOfflineDrafts(listOfflineExpenseDrafts(nextId));
          } else {
            setExpenses([]);
            setSettlements([]);
            setPaymentLinks([]);
            setAuditEvents([]);
            setMembers([]);
            setBalances(null);
            setLedgerEntries([]);
            setOfflineDrafts([]);
          }
          setError(null);
        } catch (err: unknown) {
          setError(err instanceof Error ? err.message : "خطای ناشناخته");
        }
      })();
    });
  }
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const identity = getDevIdentity();
        setDevSubject(identity.subject);
        setDevDisplayName(identity.displayName);
        setDevIdentity(identity.subject, identity.displayName);
        const [list, nextSession] = await Promise.all([api.listWorkspaces(), api.session()]);
        if (cancelled) return;
        setSession(nextSession);
        setWorkspaces(list);
        const nextId = list[0]?.id ?? "";
        setSelectedId(nextId);
        if (nextId) {
          applyWorkspaceData(await loadWorkspaceData(nextId));
          if (!cancelled) setOfflineDrafts(listOfflineExpenseDrafts(nextId));
        }
        setError(null);
      } catch (err: unknown) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "خطای ناشناخته");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  function toggleParticipant(userId: string) {
    setParticipantIds((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId],
    );
  }
  function onCreateExpense() {
    if (!selectedId) return;
    const toman = Number(amountToman.replaceAll(",", ""));
    if (!Number.isFinite(toman) || toman <= 0) {
      setError("مبلغ تومان نامعتبر است");
      return;
    }
    if (participantIds.length === 0) {
      setError("حداقل یک شرکت‌کننده لازم است");
      return;
    }
    startTransition(() => {
      void (async () => {
        try {
          const me = await api.me();
          await api.createExpenseDraft(selectedId, {
            workspaceId: selectedId,
            title,
            total: {
              amountMinor: String(Math.round(toman) * 10),
              currency: "IRR",
            },
            paidByUserId: me.actor.userId,
            splitMethod,
            participantUserIds: participantIds,
            occurredOn: new Date().toISOString().slice(0, 10),
            idempotencyKey: crypto.randomUUID(),
          });
          applyWorkspaceData(await loadWorkspaceData(selectedId));
          setError(null);
        } catch (err: unknown) {
          setError(err instanceof Error ? err.message : "خطای ناشناخته");
        }
      })();
    });
  }
  function onSaveOfflineDraft() {
    if (!selectedId) return;
    const toman = Number(amountToman.replaceAll(",", ""));
    if (!Number.isFinite(toman) || toman <= 0) {
      setError("مبلغ تومان نامعتبر است");
      return;
    }
    saveOfflineExpenseDraft({
      workspaceId: selectedId,
      title,
      totalToman: amountToman,
      participantUserIds: participantIds,
      splitMethod,
      occurredOn: new Date().toISOString().slice(0, 10),
    });
    setOfflineDrafts(listOfflineExpenseDrafts(selectedId));
    setError(null);
  }
  function onSyncOfflineDraft(draft: OfflineExpenseDraft) {
    if (!selectedId) return;
    const toman = Number(draft.totalToman.replaceAll(",", ""));
    if (!Number.isFinite(toman) || toman <= 0) {
      setError("پیش‌نویس آفلاین مبلغ نامعتبر دارد");
      return;
    }
    startTransition(() => {
      void (async () => {
        try {
          const me = await api.me();
          await api.createExpenseDraft(selectedId, {
            workspaceId: selectedId,
            title: draft.title,
            total: {
              amountMinor: String(Math.round(toman) * 10),
              currency: "IRR",
            },
            paidByUserId: me.actor.userId,
            splitMethod: draft.splitMethod,
            participantUserIds:
              draft.participantUserIds.length > 0
                ? draft.participantUserIds
                : participantIds,
            occurredOn: draft.occurredOn,
            note: draft.note,
            idempotencyKey: crypto.randomUUID(),
          });
          removeOfflineExpenseDraft(draft.id);
          setOfflineDrafts(listOfflineExpenseDrafts(selectedId));
          applyWorkspaceData(await loadWorkspaceData(selectedId));
          setError(null);
        } catch (err: unknown) {
          setError(err instanceof Error ? err.message : "خطای ناشناخته");
        }
      })();
    });
  }
  function onCreateSettlement() {
    if (!selectedId || !settleToUserId) return;
    const toman = Number(settleAmountToman.replaceAll(",", ""));
    if (!Number.isFinite(toman) || toman <= 0) {
      setError("مبلغ تسویه نامعتبر است");
      return;
    }
    startTransition(() => {
      void (async () => {
        try {
          const me = await api.me();
          if (settleToUserId === me.actor.userId) {
            setError("طرف تسویه باید شخص دیگری باشد");
            return;
          }
          await api.createSettlementClaim(selectedId, {
            workspaceId: selectedId,
            fromUserId: me.actor.userId,
            toUserId: settleToUserId,
            amount: {
              amountMinor: String(Math.round(toman) * 10),
              currency: "IRR",
            },
            note: "ادعای تسویه آزمایشی — بدون کیف پول",
            idempotencyKey: crypto.randomUUID(),
          });
          applyWorkspaceData(await loadWorkspaceData(selectedId));
          setError(null);
        } catch (err: unknown) {
          setError(err instanceof Error ? err.message : "خطای ناشناخته");
        }
      })();
    });
  }
  function onCreatePaymentLink(settlement: SettlementSummary) {
    if (!selectedId) return;
    startTransition(() => {
      void (async () => {
        try {
          await api.createPaymentLink(selectedId, {
            workspaceId: selectedId,
            settlementId: settlement.id,
            amount: settlement.amount,
            description: `تسویه ${settlement.id.slice(0, 8)}`,
            returnUrl:
              typeof window !== "undefined"
                ? `${window.location.origin}/workspaces`
                : "http://localhost:3005/workspaces",
            idempotencyKey: crypto.randomUUID(),
          });
          applyWorkspaceData(await loadWorkspaceData(selectedId));
          setError(null);
        } catch (err: unknown) {
          setError(err instanceof Error ? err.message : "خطای ناشناخته");
        }
      })();
    });
  }
  function onConfirmSettlement(settlementId: string) {
    if (!selectedId) return;
    startTransition(() => {
      void (async () => {
        try {
          await api.confirmSettlement(selectedId, settlementId);
          applyWorkspaceData(await loadWorkspaceData(selectedId));
          setError(null);
        } catch (err: unknown) {
          setError(err instanceof Error ? err.message : "خطای ناشناخته");
        }
      })();
    });
  }
  function onDisputeSettlement(settlementId: string) {
    if (!selectedId) return;
    startTransition(() => {
      void (async () => {
        try {
          await api.disputeSettlement(selectedId, settlementId);
          applyWorkspaceData(await loadWorkspaceData(selectedId));
          setError(null);
        } catch (err: unknown) {
          setError(err instanceof Error ? err.message : "خطای ناشناخته");
        }
      })();
    });
  }
  function onCancelSettlement(settlementId: string) {
    if (!selectedId) return;
    startTransition(() => {
      void (async () => {
        try {
          await api.cancelSettlement(selectedId, settlementId);
          applyWorkspaceData(await loadWorkspaceData(selectedId));
          setError(null);
        } catch (err: unknown) {
          setError(err instanceof Error ? err.message : "خطای ناشناخته");
        }
      })();
    });
  }
  function onSubmitExpense(expenseId: string) {
    if (!selectedId) return;
    startTransition(() => {
      void (async () => {
        try {
          await api.submitExpense(selectedId, expenseId);
          applyWorkspaceData(await loadWorkspaceData(selectedId));
          setError(null);
        } catch (err: unknown) {
          setError(err instanceof Error ? err.message : "خطای ناشناخته");
        }
      })();
    });
  }
  function onPostExpense(expenseId: string) {
    if (!selectedId) return;
    startTransition(() => {
      void (async () => {
        try {
          await api.postExpense(selectedId, expenseId);
          applyWorkspaceData(await loadWorkspaceData(selectedId));
          setError(null);
        } catch (err: unknown) {
          setError(err instanceof Error ? err.message : "خطای ناشناخته");
        }
      })();
    });
  }
  function memberLabel(userId: string) {
    return members.find((member) => member.userId === userId)?.displayName ?? userId.slice(0, 8);
  }
  function balancePhrase(amountMinor: string) {
    const value = BigInt(amountMinor);
    if (value > 0n) return "طلبکار";
    if (value < 0n) return "بدهکار";
    return "تسویه";
  }

  const myNetMinor = session?.actor
    ? (balances?.lines.find((line) => line.userId === session.actor?.userId)?.net.amountMinor ?? "0")
    : "0";
  const myNetToman = Math.round(Number(myNetMinor) / 10);
  const openSettlements = settlements.filter((s) => s.status === "claimed" || s.status === "disputed").length;

  return (
    <AppShell
      workspaceName={workspaces.find((w) => w.id === selectedId)?.name}
      userName={session?.actor?.displayName ?? devDisplayName}
      persistenceLabel="مالی و تسویه"
    >
      <PageHeader
        eyebrow="ماژول مالی"
        title="هزینه، مانده و تسویه"
        description={
          selectedId
            ? `${expenses.length} هزینه · ${settlements.length} تسویه · ${openSettlements} در انتظار اقدام`
            : "فضای کاری را انتخاب کنید یا بسازید تا جریان مالی زنده شود."
        }
        actions={
          <>
            <Link href="/workspaces/invite">دعوت عضو</Link>
            <Link href="/workspaces/procurement">خرید</Link>
            <button type="button" disabled={pending} onClick={refresh}>
              تازه‌سازی
            </button>
          </>
        }
      />
      {error ? <p className="liveError">{error}</p> : null}

      {workspaces.length > 0 ? (
        <div className="workspaceChipRow" style={{ marginBottom: 18 }}>
          {workspaces.map((workspace) => (
            <button
              key={workspace.id}
              type="button"
              className={workspace.id === selectedId ? "workspaceChip active" : "workspaceChip"}
              onClick={() => {
                setSelectedId(workspace.id);
                startTransition(() => {
                  void loadWorkspaceData(workspace.id)
                    .then(applyWorkspaceData)
                    .catch((err: unknown) => {
                      setError(err instanceof Error ? err.message : "خطای ناشناخته");
                    });
                });
              }}
            >
              {workspace.name} · {workspace.template}
            </button>
          ))}
        </div>
      ) : (
        <EmptyHint>
          هنوز فضایی ندارید. از <Link href="/onboarding">ساخت فضای کاری</Link> شروع کنید.
        </EmptyHint>
      )}

      {selectedId ? (
        <>
          <div className="heroGrid">
            <HeroBalance
              label="مانده خالص شما"
              amount={formatToman(myNetToman)}
              subtitle={myNetToman >= 0 ? "تومان طلب دارید" : "تومان بدهکارید"}
              actionLabel="رفتن به تسویه"
              onAction={() => {
                document.getElementById("settlement-panel")?.scrollIntoView({ behavior: "smooth" });
              }}
              hint={balances ? `zero-sum: ${balances.zeroSum ? "بله" : "خیر"}` : "…"}
            />
            <QuickAction
              title="ثبت خرج"
              description="پیش‌نویس هزینه با تقسیم مساوی."
              delayClass="delay1"
              icon={<ShellIconSvg name="receipt" />}
              onClick={() => document.getElementById("expense-panel")?.scrollIntoView({ behavior: "smooth" })}
            />
            <QuickAction
              title="چرخه خرید"
              description="نیاز و درخواست خرید را از مسیر تدارکات بفرستید."
              delayClass="delay2"
              icon={<ShellIconSvg name="cart" />}
              onClick={() => router.push("/workspaces/procurement")}
            />
          </div>

          <ProductGrid cols={2}>
            <SectionCard title="مانده اعضا" badge={balances?.lines.length ?? 0} delayClass="delay2">
              <DataList>
                {!balances || balances.lines.length === 0 ? (
                  <EmptyHint>ماندهٔ باز نیست.</EmptyHint>
                ) : (
                  balances.lines.map((line) => (
                    <DataRow
                      key={line.userId}
                      title={memberLabel(line.userId)}
                      meta={balancePhrase(line.net.amountMinor)}
                      trailing={
                        <Amount
                          irrMinor={
                            line.net.amountMinor.startsWith("-")
                              ? line.net.amountMinor.slice(1)
                              : line.net.amountMinor
                          }
                        />
                      }
                    />
                  ))
                )}
              </DataList>
            </SectionCard>

            <SectionCard title="هزینه‌های اخیر" badge={expenses.length} delayClass="delay2">
              <DataList>
                {expenses.length === 0 ? <EmptyHint>هزینه‌ای ثبت نشده.</EmptyHint> : null}
                {expenses.slice(0, 5).map((expense) => (
                  <DataRow
                    key={expense.id}
                    title={expense.title}
                    meta={
                      <StatusPill tone={expense.status === "posted" ? "ok" : "warn"}>{expense.status}</StatusPill>
                    }
                    trailing={<Amount irrMinor={expense.total.amountMinor} />}
                    actions={
                      <>
                        {expense.status === "draft" ? (
                          <Button
                            type="button"
                            variant="ghost"
                            onClick={() => onSubmitExpense(expense.id)}
                            disabled={pending}
                          >
                            ارسال
                          </Button>
                        ) : null}
                        {expense.status === "draft" || expense.status === "submitted" ? (
                          <Button
                            type="button"
                            variant="ghost"
                            onClick={() => onPostExpense(expense.id)}
                            disabled={pending}
                          >
                            ثبت در دفترکل
                          </Button>
                        ) : null}
                      </>
                    }
                  />
                ))}
              </DataList>
            </SectionCard>
          </ProductGrid>

          <ProductGrid>
            <SectionCard title="پیش‌نویس هزینه + تقسیم مساوی" delayClass="delay3">
              <div id="expense-panel" />
              <FormStack>
                <TextField label="عنوان" value={title} onChange={(event) => setTitle(event.target.value)} />
                <TextField
                  label="مبلغ (تومان)"
                  value={amountToman}
                  onChange={(event) => setAmountToman(event.target.value)}
                />
                <SelectField
                  label="روش تقسیم"
                  value={splitMethod}
                  onChange={(event) => setSplitMethod(event.target.value as SplitMethod)}
                >
                  <option value="equal">مساوی</option>
                  <option value="amount">مبلغی (API)</option>
                  <option value="percent">درصدی (API)</option>
                  <option value="shares">سهمی (API)</option>
                </SelectField>
                <fieldset style={{ margin: 0, border: "1px solid var(--line)", borderRadius: 12, padding: 12 }}>
                  <legend style={{ paddingInline: 6, color: "var(--muted)" }}>شرکت‌کنندگان</legend>
                  {members.length === 0 ? (
                    <EmptyHint>عضوی نیست.</EmptyHint>
                  ) : (
                    <div style={{ display: "grid", gap: 8 }}>
                      {members.map((member) => (
                        <label key={member.userId} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                          <input
                            type="checkbox"
                            checked={participantIds.includes(member.userId)}
                            onChange={() => toggleParticipant(member.userId)}
                          />
                          <span>
                            {member.displayName} · {member.role}
                          </span>
                        </label>
                      ))}
                    </div>
                  )}
                </fieldset>
                {previewSplits.length > 0 ? (
                  <DataList>
                    {previewSplits.map((line) => (
                      <DataRow
                        key={line.userId}
                        title={memberLabel(line.userId)}
                        trailing={<Amount irrMinor={line.amount.amountMinor} />}
                      />
                    ))}
                  </DataList>
                ) : null}
                <div className="dataRowActions">
                  <Button type="button" onClick={onCreateExpense} disabled={pending}>
                    ثبت پیش‌نویس
                  </Button>
                  <Button type="button" variant="ghost" onClick={onSaveOfflineDraft} disabled={pending}>
                    ذخیره آفلاین
                  </Button>
                </div>
              </FormStack>
              {offlineDrafts.length > 0 ? (
                <DataList>
                  {offlineDrafts.map((draft) => (
                    <DataRow
                      key={draft.id}
                      title={draft.title}
                      meta={`${draft.totalToman} تومان`}
                      actions={
                        <>
                          <Button
                            type="button"
                            variant="ghost"
                            onClick={() => onSyncOfflineDraft(draft)}
                            disabled={pending}
                          >
                            همگام‌سازی
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            onClick={() => {
                              removeOfflineExpenseDraft(draft.id);
                              setOfflineDrafts(listOfflineExpenseDrafts(selectedId));
                            }}
                          >
                            حذف
                          </Button>
                        </>
                      }
                    />
                  ))}
                </DataList>
              ) : null}
            </SectionCard>

            <SectionCard title="ادعای تسویه + لینک پرداخت" delayClass="delay3">
              <div id="settlement-panel" />
              <FormStack>
                <SelectField
                  label="طرف مقابل"
                  value={settleToUserId}
                  onChange={(event) => setSettleToUserId(event.target.value)}
                >
                  {members.map((member) => (
                    <option key={member.userId} value={member.userId}>
                      {member.displayName} · {member.role}
                    </option>
                  ))}
                </SelectField>
                <TextField
                  label="مبلغ تسویه (تومان)"
                  value={settleAmountToman}
                  onChange={(event) => setSettleAmountToman(event.target.value)}
                />
                <Button type="button" onClick={onCreateSettlement} disabled={pending || members.length < 2}>
                  ثبت ادعا
                </Button>
              </FormStack>
              {members.length < 2 ? (
                <EmptyHint>
                  برای تسویه حداقل دو عضو لازم است — از <Link href="/workspaces/invite">دعوت</Link>{" "}
                  استفاده کنید.
                </EmptyHint>
              ) : null}
              <DataList>
                {settlements.map((settlement) => (
                  <DataRow
                    key={settlement.id}
                    title={`${memberLabel(settlement.fromUserId)} → ${memberLabel(settlement.toUserId)}`}
                    meta={
                      <StatusPill tone={settlement.status === "confirmed" ? "ok" : "gold"}>
                        {settlement.status}
                      </StatusPill>
                    }
                    trailing={<Amount irrMinor={settlement.amount.amountMinor} />}
                    actions={
                      settlement.status === "claimed" ? (
                        <>
                          <Button
                            type="button"
                            variant="ghost"
                            onClick={() => onConfirmSettlement(settlement.id)}
                            disabled={pending}
                          >
                            تأیید
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            onClick={() => onDisputeSettlement(settlement.id)}
                            disabled={pending}
                          >
                            اعتراض
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            onClick={() => onCancelSettlement(settlement.id)}
                            disabled={pending}
                          >
                            لغو
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            onClick={() => onCreatePaymentLink(settlement)}
                            disabled={pending}
                          >
                            لینک پرداخت
                          </Button>
                        </>
                      ) : settlement.status === "disputed" ? (
                        <Button
                          type="button"
                          variant="ghost"
                          onClick={() => onCancelSettlement(settlement.id)}
                          disabled={pending}
                        >
                          لغو
                        </Button>
                      ) : null
                    }
                  />
                ))}
              </DataList>
              {paymentLinks.length > 0 ? (
                <DataList>
                  {paymentLinks.map((link) => (
                    <DataRow
                      key={link.id}
                      title={`پرداخت ${link.status}`}
                      meta={
                        <a href={link.checkoutUrl} target="_blank" rel="noreferrer">
                          باز کردن checkout
                        </a>
                      }
                      trailing={<Amount irrMinor={link.amount.amountMinor} />}
                    />
                  ))}
                </DataList>
              ) : null}
            </SectionCard>
          </ProductGrid>

          <ProductGrid cols={2}>
            <SectionCard title="دفترکل" badge={ledgerEntries.length} delayClass="delay4">
              <DataList>
                {ledgerEntries.length === 0 ? (
                  <EmptyHint>هنوز ورودی journal نیست — هزینه را Post کنید.</EmptyHint>
                ) : null}
                {ledgerEntries.map((entry) => (
                  <DataRow
                    key={entry.id}
                    title={`${entry.sourceType}:${entry.sourceId.slice(0, 8)}`}
                    meta={entry.lines
                      .map((line) => `${line.side} ${memberLabel(line.userId)}`)
                      .join(" · ")}
                    trailing={`${entry.lines.length} خط`}
                  />
                ))}
              </DataList>
            </SectionCard>
            <SectionCard title="رویدادهای Audit" badge={auditEvents.length} delayClass="delay4">
              <DataList>
                {auditEvents.length === 0 ? <EmptyHint>رویدادی نیست.</EmptyHint> : null}
                {auditEvents.slice(0, 12).map((event) => (
                  <DataRow
                    key={event.id}
                    title={event.action}
                    meta={`${event.targetType} · ${event.result}`}
                    trailing={
                      <StatusPill tone={event.result === "success" ? "ok" : "warn"}>
                        {event.result}
                      </StatusPill>
                    }
                  />
                ))}
              </DataList>
            </SectionCard>
          </ProductGrid>
        </>
      ) : null}

      <details className="devtoolsDetails">
        <summary>ابزار توسعه · هویت Dev</summary>
        <FormStack>
          <p className="emptyHint" style={{ border: "none", padding: 0 }}>
            تا OIDC، هویت از localStorage می‌آید.
            {session?.actor ? (
              <>
                {" "}
                الان: {session.actor.displayName} ({session.mode})
              </>
            ) : null}
          </p>
          <TextField
            label="Subject"
            value={devSubject}
            onChange={(event) => setDevSubject(event.target.value)}
          />
          <TextField
            label="نام نمایشی"
            value={devDisplayName}
            onChange={(event) => setDevDisplayName(event.target.value)}
          />
          <Button type="button" onClick={refresh} disabled={pending}>
            اعمال هویت و تازه‌سازی
          </Button>
        </FormStack>
      </details>
    </AppShell>
  );
}
