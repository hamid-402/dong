"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import type {
  CreateInviteResponse,
  ExpenseSummary,
  ExpenseVisibility,
  MembershipSummary,
  WorkspaceBalancesResponse,
  WorkspaceSummary,
} from "@dang/contracts";
import { suggestMinimalSettlements } from "@dang/contracts";
import { Amount, Button, SelectField, TextField } from "@dang/ui";
import { AppShell } from "@/components/app-shell";
import { JalaliDateField } from "@/components/jalali-date-field";
import {
  SplitComposer,
  buildSplitPayloadFromComposer,
  emptySplitComposer,
  type SplitComposerValue,
} from "@/components/split-composer";
import {
  DataList,
  DataRow,
  EmptyHint,
  FormStack,
  PageHeader,
  ProductGrid,
  SectionCard,
  StatusLine,
  StatusPill,
} from "@/components/ui-blocks";
import { api } from "@/lib/api";
import { friendlyErrorMessage } from "@/lib/api-errors";
import { hubPathFor } from "@/lib/hub-links";
import { expenseStatusLabel, workspaceTemplateLabel } from "@/lib/status-labels";
import { useFlashMessage } from "@/lib/use-flash-message";
import { useAppChrome } from "@/lib/use-app-chrome";
import { templateSupportsCompanyExpenses } from "@/lib/workspace-modules";

type ExpenseFilter = "all" | "shared" | "private" | "company";

function visibilityLabel(visibility: ExpenseVisibility): string {
  if (visibility === "private") return "خصوصی";
  if (visibility === "company") return "شرکتی";
  return "جمعی";
}

function visibilityTone(visibility: ExpenseVisibility): "ok" | "gold" | "warn" {
  if (visibility === "private") return "warn";
  if (visibility === "company") return "gold";
  return "ok";
}

const initialSplit: SplitComposerValue = emptySplitComposer("shared");

export function FriendsGroupView() {
  const router = useRouter();
  const chrome = useAppChrome();
  const { successMessage, error, setError, flashSuccess } = useFlashMessage();
  const [loading, setLoading] = useState(true);
  const [workspace, setWorkspace] = useState<WorkspaceSummary | null>(null);
  const [members, setMembers] = useState<MembershipSummary[]>([]);
  const [expenses, setExpenses] = useState<ExpenseSummary[]>([]);
  const [balances, setBalances] = useState<WorkspaceBalancesResponse | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string>("");
  const [filter, setFilter] = useState<ExpenseFilter>("all");
  const [groupName, setGroupName] = useState("");
  const [groupTemplate, setGroupTemplate] = useState<"friends_family" | "household">(
    "friends_family",
  );
  const [friendEmail, setFriendEmail] = useState("");
  const [createdInvite, setCreatedInvite] = useState<CreateInviteResponse | null>(null);
  const [expenseTitle, setExpenseTitle] = useState("");
  const [expenseToman, setExpenseToman] = useState("");
  const [expenseDate, setExpenseDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [split, setSplit] = useState<SplitComposerValue>(initialSplit);
  const [outingTitle, setOutingTitle] = useState("");
  const [outings, setOutings] = useState<
    Array<{ id: string; title: string; total: { amountMinor: string }; expenseIds: string[] }>
  >([]);
  const [selectedOutingId, setSelectedOutingId] = useState("");
  const [pending, startTransition] = useTransition();

  const supportsCompany = templateSupportsCompanyExpenses(workspace?.template);

  async function refresh(workspaceId: string) {
    const [memberList, expenseList, balanceData, me, outingList] = await Promise.all([
      api.listMembers(workspaceId),
      api.listExpenses(workspaceId),
      api.getBalances(workspaceId),
      api.me(),
      api.listOutings(workspaceId).catch(() => []),
    ]);
    const current = chrome.workspaces.find((item) => item.id === workspaceId) ?? null;
    setWorkspace((prev) => current ?? (prev?.id === workspaceId ? prev : null));
    setMembers(memberList);
    setExpenses(expenseList);
    setBalances(balanceData);
    setOutings(outingList);
    setCurrentUserId(me.actor.userId);
    setSplit((prev) => ({
      ...prev,
      participantUserIds:
        prev.participantUserIds.length > 0
          ? prev.participantUserIds.filter((id) => memberList.some((m) => m.userId === id))
          : memberList.map((m) => m.userId),
    }));
  }

  useEffect(() => {
    if (!chrome.ready) return;
    if (!chrome.workspaceId) {
      setWorkspace(null);
      setMembers([]);
      setExpenses([]);
      setBalances(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    void refresh(chrome.workspaceId)
      .then(() => setError(null))
      .catch((err: unknown) => setError(friendlyErrorMessage(err, "خطا")))
      .finally(() => setLoading(false));
  }, [chrome.workspaceId, chrome.ready]);

  const filteredExpenses = useMemo(() => {
    if (filter === "all") return expenses;
    return expenses.filter((item) => item.visibility === filter);
  }, [expenses, filter]);

  const counts = useMemo(
    () => ({
      all: expenses.length,
      shared: expenses.filter((e) => e.visibility === "shared").length,
      private: expenses.filter((e) => e.visibility === "private").length,
      company: expenses.filter((e) => e.visibility === "company").length,
    }),
    [expenses],
  );

  const settlementSuggestions = useMemo(
    () => (balances ? suggestMinimalSettlements(balances.lines) : []),
    [balances],
  );

  function onCreateGroup() {
    const name = groupName.trim();
    if (!name) {
      setError("نام گروه را وارد کنید");
      return;
    }
    // API slug is ASCII kebab-case only; Persian names get a generated suffix.
    const ascii =
      name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 28);
    const slugPrefix = groupTemplate === "household" ? "family" : "friends";
    const slug = `${slugPrefix}-${ascii || Date.now().toString(36)}`.slice(0, 48);
    startTransition(() => {
      void (async () => {
        try {
          const created = await api.createWorkspace(
            {
              name,
              slug,
              template: groupTemplate,
            },
            crypto.randomUUID(),
          );
          chrome.selectWorkspace(created.id);
          chrome.refreshChrome();
          setWorkspace(created);
          setGroupName("");
          setError(null);
          flashSuccess(
            groupTemplate === "household"
              ? `گروه خانواده «${created.name}» ساخته شد`
              : `گروه «${created.name}» ساخته شد`,
          );
          await refresh(created.id);
        } catch (err: unknown) {
          setError(friendlyErrorMessage(err, "ساخت گروه ناموفق"));
        }
      })();
    });
  }

  function onInviteFriend() {
    if (!chrome.workspaceId) return;
    const subject = friendEmail.trim();
    if (!subject) {
      setError("ایمیل یا شناسه دوست را وارد کنید");
      return;
    }
    startTransition(() => {
      void (async () => {
        try {
          const invite = await api.createInvite(chrome.workspaceId, {
            role: "member",
            invitedSubject: subject,
          });
          setCreatedInvite(invite);
          setFriendEmail("");
          setError(null);
          flashSuccess(
            invite.emailDelivered
              ? "دعوت برای دوست ایمیل شد"
              : "لینک دعوت آماده است — برای دوست بفرستید",
          );
        } catch (err: unknown) {
          setError(friendlyErrorMessage(err, "دعوت ناموفق"));
        }
      })();
    });
  }

  function onQuickExpense() {
    if (!chrome.workspaceId) return;
    const title = expenseTitle.trim();
    if (!title) {
      setError("عنوان خرج را وارد کنید");
      return;
    }
    startTransition(() => {
      void (async () => {
        try {
          const me = await api.me();
          const payload = buildSplitPayloadFromComposer(
            split.visibility === "private"
              ? { ...split, splitMethod: "equal", participantUserIds: [me.actor.userId] }
              : split,
          );
          const totalMinor =
            payload.totalMinor ??
            (() => {
              const toman = Number(expenseToman.replaceAll(",", ""));
              if (!Number.isFinite(toman) || toman <= 0) throw new Error("AMOUNT");
              return String(Math.round(toman) * 10);
            })();
          const participants =
            split.visibility === "private"
              ? [me.actor.userId]
              : payload.participantUserIds;
          if (participants.length === 0) {
            setError("حداقل یک عضو لازم است — اول دوست دعوت کنید");
            return;
          }
          await api.createExpenseDraft(chrome.workspaceId, {
            workspaceId: chrome.workspaceId,
            title,
            total: { amountMinor: totalMinor, currency: "IRR" },
            paidByUserId: me.actor.userId,
            splitMethod: payload.splitMethod,
            participantUserIds: participants,
            splitLines: payload.splitLines,
            items: payload.items,
            tip: payload.tip,
            tax: payload.tax,
            discount: payload.discount,
            outingId: selectedOutingId || undefined,
            occurredOn: expenseDate,
            visibility: split.visibility,
            idempotencyKey: crypto.randomUUID(),
          }).then(async (created) => {
            // Shared/private group expenses: post so balances update (company stays draft if approval required).
            if (split.visibility === "company") {
              await api.submitExpense(chrome.workspaceId, created.id);
              return created;
            }
            await api.submitExpense(chrome.workspaceId, created.id);
            await api.postExpense(chrome.workspaceId, created.id);
            return created;
          });
          setExpenseTitle("");
          setExpenseToman("");
          setExpenseDate(new Date().toISOString().slice(0, 10));
          setError(null);
          flashSuccess(
            split.visibility === "company"
              ? "خرج شرکتی ثبت شد و منتظر تأیید است"
              : `خرج ثبت شد · اعضا سهم را در مانده می‌بینند · برای دریافت پول به تسویه بروید`,
          );
          await refresh(chrome.workspaceId);
        } catch (err: unknown) {
          if (err instanceof Error && err.message === "AMOUNT") {
            setError("مبلغ نامعتبر است");
            return;
          }
          setError(friendlyErrorMessage(err, "ثبت خرج ناموفق"));
        }
      })();
    });
  }

  function onCreateOuting() {
    if (!chrome.workspaceId) return;
    const title = outingTitle.trim();
    if (!title) {
      setError("عنوان گردش را وارد کنید");
      return;
    }
    startTransition(() => {
      void (async () => {
        try {
          const created = await api.createOuting(chrome.workspaceId, {
            title,
            occurredOn: new Date().toISOString().slice(0, 10),
            idempotencyKey: crypto.randomUUID(),
          });
          setOutingTitle("");
          setSelectedOutingId(created.id);
          flashSuccess(`گردش «${created.title}» ساخته شد`);
          await refresh(chrome.workspaceId);
        } catch (err: unknown) {
          setError(friendlyErrorMessage(err, "ساخت گردش ناموفق"));
        }
      })();
    });
  }

  function memberLabel(userId: string) {
    return members.find((m) => m.userId === userId)?.displayName ?? userId.slice(0, 8);
  }

  const pageError = error ?? chrome.error;

  return (
    <AppShell
      workspaceId={chrome.workspaceId}
      workspaceName={chrome.workspaceName || undefined}
      userName={chrome.userName || undefined}
      persistenceLabel={chrome.persistenceLabel}
    >
      <PageHeader
        eyebrow="فضای گروهی"
        title="خانه گروه و خانواده"
        description="نقش مادرخرج: خرج را ثبت کنید تا اعضا جزئیات و سهم را ببینند، بعد تأیید و تسویه کنند."
        actions={
          <>
            <a href="#quick-expense">ثبت خرج گروه</a>
            <span className="uxSecondaryActions">
              <a href="#group-settle">تسویه</a>
              <Link href={hubPathFor("/daily-ledger")}>دفتر روزانه</Link>
              <Link href={hubPathFor("/workspaces")}>مالی کامل</Link>
              <Link href={hubPathFor("/workspaces/invite")}>دعوت عضو</Link>
            </span>
          </>
        }
      />
      {pageError ? <p className="liveError">{pageError}</p> : null}
      {successMessage ? <p className="liveSuccess">{successMessage}</p> : null}

      {loading ? (
        <EmptyHint>در حال بارگذاری گروه…</EmptyHint>
      ) : (
        <ProductGrid>
          {workspace ? (
            <div className="motherSpendJourney" aria-label="مسیر مادرخرج">
              <div>
                <strong>۱. ثبت</strong>
                <span>خرج را با تقسیم اعضا بنویسید</span>
              </div>
              <div>
                <strong>۲. مشاهده</strong>
                <span>هر عضو سهم و جزئیات را می‌بیند</span>
              </div>
              <div>
                <strong>۳. تسویه</strong>
                <span>تأیید و پرداخت مانده</span>
              </div>
            </div>
          ) : null}

          {workspace ? (
            <SectionCard title="گروه فعال" delayClass="delay1">
              <StatusLine>
                فعال: <b>{workspace.name}</b> · {workspaceTemplateLabel(workspace.template)}
              </StatusLine>
              <details className="reportDetails">
                <summary>
                  <span>ساخت گروه دیگر</span>
                  <span>{members.length} عضو</span>
                </summary>
                <div className="reportDetails__body">
                  <FormStack density="compact">
                    <TextField
                      label="نام گروه"
                      value={groupName}
                      onChange={(e) => setGroupName(e.target.value)}
                      hint="مثلاً سفر شمال، خانه، تیم فوتبال"
                    />
                    <SelectField
                      label="نوع گروه"
                      value={groupTemplate}
                      onChange={(e) =>
                        setGroupTemplate(e.target.value as "friends_family" | "household")
                      }
                    >
                      <option value="friends_family">دوستان</option>
                      <option value="household">خانواده</option>
                    </SelectField>
                    <Button type="button" onClick={onCreateGroup} disabled={pending}>
                      ساخت گروه
                    </Button>
                  </FormStack>
                </div>
              </details>
            </SectionCard>
          ) : (
            <SectionCard title="ساخت گروه" delayClass="delay1">
              <FormStack>
                <TextField
                  label="نام گروه"
                  value={groupName}
                  onChange={(e) => setGroupName(e.target.value)}
                  hint="مثلاً سفر شمال، خانه، تیم فوتبال"
                />
                <SelectField
                  label="نوع گروه"
                  value={groupTemplate}
                  onChange={(e) =>
                    setGroupTemplate(e.target.value as "friends_family" | "household")
                  }
                >
                  <option value="friends_family">دوستان</option>
                  <option value="household">خانواده</option>
                </SelectField>
                <Button type="button" onClick={onCreateGroup} disabled={pending}>
                  ساخت گروه
                </Button>
              </FormStack>
              <EmptyHint>هنوز گروهی فعال نیست — یکی بسازید یا از مدیریت انتخاب کنید.</EmptyHint>
            </SectionCard>
          )}

          <SectionCard title="مانده اعضا" badge={balances?.lines.length} delayClass="delay1">
            <div id="group-settle" />
            {!balances || balances.lines.length === 0 ? (
              <EmptyHint>هنوز خرج ثبت‌شده‌ای نیست — از «ثبت خرج گروه» شروع کنید.</EmptyHint>
            ) : (
              <DataList>
                {balances.lines.map((line) => {
                  const net = BigInt(line.net.amountMinor);
                  const abs = net < 0n ? (-net).toString() : net.toString();
                  return (
                    <DataRow
                      key={line.userId}
                      title={memberLabel(line.userId)}
                      meta={
                        net > 0n ? (
                          <span className="balanceCreditor">طلبکار (باید بگیرد)</span>
                        ) : net < 0n ? (
                          <span className="balanceDebtor">بدهکار (باید بدهد)</span>
                        ) : (
                          <span className="liveHint">تسویه</span>
                        )
                      }
                      trailing={<Amount irrMinor={abs} />}
                    />
                  );
                })}
              </DataList>
            )}
            {settlementSuggestions.length > 0 ? (
              <>
                <p className="liveHint">پیشنهاد تسویه حداقلی — عضو بدهکار به طلبکار</p>
                <DataList>
                  {settlementSuggestions.map((s) => (
                    <DataRow
                      key={`${s.fromUserId}-${s.toUserId}-${s.amount.amountMinor}`}
                      title={`${memberLabel(s.fromUserId)} می‌دهد به ${memberLabel(s.toUserId)}`}
                      trailing={<Amount irrMinor={s.amount.amountMinor} />}
                    />
                  ))}
                </DataList>
              </>
            ) : null}
            <div className="dataRowActions">
              <Button
                type="button"
                onClick={() => router.push(`${hubPathFor("/workspaces")}#settlement-panel`)}
              >
                ثبت و تأیید تسویه
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => router.push(hubPathFor("/daily-ledger"))}
              >
                دفتر مصرف روزانه
              </Button>
            </div>
          </SectionCard>

          <SectionCard
            title="ثبت خرج گروه (مادرخرج)"
            delayClass="delay1"
            className="uxPrimaryPanel"
          >
            <div id="quick-expense">
            {!chrome.workspaceId ? (
              <EmptyHint>برای ثبت خرج، گروه را فعال کنید.</EmptyHint>
            ) : (
              <FormStack>
                <StatusLine>
                  پول را شما می‌دهید؛ سهم اعضا را مشخص کنید تا در سامانه خودشان ببینند و بعداً
                  تسویه کنند.
                </StatusLine>
                <TextField
                  label="عنوان خرج"
                  value={expenseTitle}
                  onChange={(e) => setExpenseTitle(e.target.value)}
                  hint="مثلاً خرید هفته، ناهار جمعه، قبض اینترنت"
                />
                <JalaliDateField label="تاریخ خرج" value={expenseDate} onChange={setExpenseDate} />
                {split.splitMethod !== "itemized" ? (
                  <TextField
                    label="مبلغ کل (تومان)"
                    value={expenseToman}
                    onChange={(e) => setExpenseToman(e.target.value)}
                  />
                ) : (
                  <p className="liveHint">
                    مبلغ کل از جمع آیتم‌ها + انعام/مالیات/تخفیف محاسبه می‌شود
                    {expenseToman ? ` · ${expenseToman} تومان` : ""}
                  </p>
                )}
                <SplitComposer
                  members={members}
                  totalToman={expenseToman}
                  value={split}
                  onChange={setSplit}
                  supportsCompany={supportsCompany}
                  currentUserId={currentUserId}
                  onDerivedTotalToman={setExpenseToman}
                />
                <Button type="button" onClick={onQuickExpense} disabled={pending}>
                  ثبت و اعمال روی مانده
                </Button>
                <p className="liveHint">
                  برای مصرف روزبه‌روز هر نفر (بدون تسویه یک‌جا) از{" "}
                  <Link href={hubPathFor("/daily-ledger")}>دفتر روزانه</Link> استفاده کنید.
                </p>
              </FormStack>
            )}
            </div>
          </SectionCard>

          <SectionCard title="افزودن دوست" badge={members.length} delayClass="delay2">
            {!chrome.workspaceId ? (
              <EmptyHint>اول گروه بسازید یا انتخاب کنید.</EmptyHint>
            ) : (
              <>
                <FormStack>
                  <TextField
                    label="ایمیل یا شناسه دوست"
                    value={friendEmail}
                    onChange={(e) => setFriendEmail(e.target.value)}
                    hint="اگر Resend یا SMTP واقعی فعال باشد، دعوت ایمیل می‌شود"
                  />
                  <Button type="button" onClick={onInviteFriend} disabled={pending}>
                    دعوت به گروه
                  </Button>
                </FormStack>
                {createdInvite ? (
                  <p className="liveSuccess">
                    لینک دعوت:{" "}
                    <a href={createdInvite.debugInviteUrl ?? createdInvite.acceptPath}>
                      {createdInvite.acceptPath}
                    </a>
                    {createdInvite.emailDelivered ? " · ایمیل ارسال شد" : null}
                  </p>
                ) : null}
                {members.length === 0 ? (
                  <EmptyHint>عضوی نیست.</EmptyHint>
                ) : (
                  <DataList>
                    {members.map((member) => (
                      <DataRow
                        key={member.userId}
                        title={member.displayName}
                        meta={
                          workspace?.template === "household"
                            ? `${member.role} · سهم پیش‌فرض ${member.defaultShares}`
                            : member.role
                        }
                        trailing={
                          workspace?.template === "household" ? (
                            <label className="liveHint" style={{ display: "flex", gap: 6, alignItems: "center" }}>
                              <span>وزن</span>
                              <input
                                type="number"
                                min={1}
                                max={99}
                                defaultValue={member.defaultShares}
                                style={{ width: 52 }}
                                aria-label={`سهم پیش‌فرض ${member.displayName}`}
                                onBlur={(e) => {
                                  const n = Math.max(1, Math.round(Number(e.target.value) || 1));
                                  if (n === member.defaultShares || !chrome.workspaceId) return;
                                  startTransition(() => {
                                    void (async () => {
                                      try {
                                        await api.setMemberDefaultShares(
                                          chrome.workspaceId,
                                          member.userId,
                                          n,
                                        );
                                        flashSuccess(`سهم ${member.displayName} به‌روز شد`);
                                        await refresh(chrome.workspaceId);
                                      } catch (err: unknown) {
                                        setError(friendlyErrorMessage(err, "به‌روزرسانی سهم ناموفق"));
                                      }
                                    })();
                                  });
                                }}
                              />
                            </label>
                          ) : (
                            <StatusPill tone="ok">عضو</StatusPill>
                          )
                        }
                      />
                    ))}
                  </DataList>
                )}
              </>
            )}
          </SectionCard>

          <details className="reportDetails">
            <summary>
              <span>گردش چندخرجی (اختیاری)</span>
              <span>{outings.length}</span>
            </summary>
            <div className="reportDetails__body">
              {!chrome.workspaceId ? (
                <EmptyHint>اول گروه را فعال کنید.</EmptyHint>
              ) : (
                <FormStack density="compact">
                  <TextField
                    label="عنوان گردش"
                    value={outingTitle}
                    onChange={(e) => setOutingTitle(e.target.value)}
                    hint="مثلاً بیرون‌رفتن جمعه = بستنی + ناهار"
                  />
                  <Button type="button" onClick={onCreateOuting} disabled={pending}>
                    ساخت گردش
                  </Button>
                  {outings.length > 0 ? (
                    <SelectField
                      label="اتصال خرج به گردش"
                      value={selectedOutingId}
                      onChange={(e) => setSelectedOutingId(e.target.value)}
                    >
                      <option value="">بدون گردش</option>
                      {outings.map((row) => (
                        <option key={row.id} value={row.id}>
                          {row.title} · {row.expenseIds.length} خرج
                        </option>
                      ))}
                    </SelectField>
                  ) : null}
                </FormStack>
              )}
            </div>
          </details>

          <SectionCard title="خرج‌های گروه" badge={counts.all} delayClass="delay2">
            <div className="expenseFilterRow" role="tablist" aria-label="فیلتر نوع خرج">
              {(
                [
                  ["all", `همه (${counts.all})`],
                  ["shared", `جمعی (${counts.shared})`],
                  ["private", `خصوصی من (${counts.private})`],
                  ...(supportsCompany
                    ? ([["company", `شرکتی (${counts.company})`]] as Array<
                        [ExpenseFilter, string]
                      >)
                    : []),
                ] as Array<[ExpenseFilter, string]>
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={filter === key}
                  className={filter === key ? "expenseFilter active" : "expenseFilter"}
                  onClick={() => setFilter(key)}
                >
                  {label}
                </button>
              ))}
            </div>
            {filteredExpenses.length === 0 ? (
              <EmptyHint>خرجی در این دسته نیست.</EmptyHint>
            ) : (
              <DataList>
                {filteredExpenses.slice(0, 12).map((expense) => (
                  <DataRow
                    key={expense.id}
                    title={expense.title}
                    meta={
                      <>
                        <StatusPill tone={visibilityTone(expense.visibility)}>
                          {visibilityLabel(expense.visibility)}
                        </StatusPill>
                        <StatusPill tone={expense.status === "posted" ? "ok" : "warn"}>
                          {expenseStatusLabel(expense.status)}
                        </StatusPill>
                        <span className="liveHint">
                          پرداخت: {memberLabel(expense.paidByUserId)}
                          {expense.splits?.length
                            ? ` · ${expense.splits.length} سهم`
                            : ""}
                        </span>
                      </>
                    }
                    trailing={<Amount irrMinor={expense.total.amountMinor} />}
                  />
                ))}
              </DataList>
            )}
            <Button
              type="button"
              variant="ghost"
              onClick={() => router.push(hubPathFor("/workspaces"))}
            >
              مشاهده همه در مالی
            </Button>
          </SectionCard>
        </ProductGrid>
      )}
    </AppShell>
  );
}
