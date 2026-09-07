"use client";

import { newClientId } from "@/lib/id";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import type {
  CreateInviteResponse,
  ExpenseSummary,
  ExpenseVisibility,
  MembershipSummary,
  WorkspaceBalancesResponse,
  WorkspaceSummary,
} from "@dang/contracts";
import { isFinanceManagerRole } from "@dang/contracts";
import { Amount, Button, SelectField, TextField } from "@dang/ui";
import { AppShell } from "@/components/app-shell";
import {
  DataList,
  DataRow,
  EmptyHint,
  EmptyStateBlock,
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
import { wPath } from "@/lib/workspace-paths";
import { NAV_LABELS } from "@/lib/nav-labels";
import { expenseStatusLabel, workspaceTemplateLabel } from "@/lib/status-labels";
import { FlashMessages, useFlashMessage } from "@/lib/use-flash-message";
import { useAppChrome } from "@/lib/use-app-chrome";
import { templateSupportsCompanyExpenses } from "@/lib/workspace-modules";
import { AddonChargesPanel } from "@/components/views/friends-group/addon-charges-panel";
import { DebtSimplifyPanel } from "@/components/views/friends-group/debt-simplify-panel";
import { AllowancesPanel } from "@/components/allowances-panel";

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

export function FriendsGroupView() {
  const router = useRouter();
  const chrome = useAppChrome();
  const { successMessage, error, setError, flashSuccess } = useFlashMessage();
  const [loading, setLoading] = useState(true);
  const [workspace, setWorkspace] = useState<WorkspaceSummary | null>(null);
  const [members, setMembers] = useState<MembershipSummary[]>([]);
  const [expenses, setExpenses] = useState<ExpenseSummary[]>([]);
  const [balances, setBalances] = useState<WorkspaceBalancesResponse | null>(null);
  const [filter, setFilter] = useState<ExpenseFilter>("all");
  const [groupName, setGroupName] = useState("");
  const [groupTemplate, setGroupTemplate] = useState<"friends_family" | "household">(
    "friends_family",
  );
  const [friendEmail, setFriendEmail] = useState("");
  const [friendRole, setFriendRole] = useState<"finance" | "member" | "guest">("finance");
  const [createdInvite, setCreatedInvite] = useState<CreateInviteResponse | null>(null);
  const [outingTitle, setOutingTitle] = useState("");
  const [outings, setOutings] = useState<
    Array<{ id: string; title: string; total: { amountMinor: string }; expenseIds: string[] }>
  >([]);
  const [selectedOutingId, setSelectedOutingId] = useState("");
  const [pending, startTransition] = useTransition();
  const [actorUserId, setActorUserId] = useState<string | null>(null);
  const supportsCompany = templateSupportsCompanyExpenses(workspace?.template);
  const slug =
    workspace?.slug ??
    chrome.workspaces.find((w) => w.id === chrome.workspaceId)?.slug ??
    null;
  const expensesHref = slug ? wPath(slug, "expenses") : hubPathFor("/workspaces");
  const settlementsHref = slug
    ? wPath(slug, "settlements")
    : `${hubPathFor("/workspaces")}#settlement-panel`;
  const invoicesHref = slug ? wPath(slug, "invoices") : hubPathFor("/workspaces");
  const canManageFinance = isFinanceManagerRole(
    members.find((m) => m.userId === actorUserId)?.role,
  );

  async function refresh(workspaceId: string) {
    const [memberList, expenseList, balanceData, outingList] = await Promise.all([
      api.listMembers(workspaceId),
      api.listExpenses(workspaceId),
      api.getBalances(workspaceId),
      api.listOutings(workspaceId).catch(() => []),
    ]);
    const current = chrome.workspaces.find((item) => item.id === workspaceId) ?? null;
    setWorkspace((prev) => current ?? (prev?.id === workspaceId ? prev : null));
    setMembers(memberList);
    setExpenses(expenseList);
    setBalances(balanceData);
    setOutings(outingList);
  }

  useEffect(() => {
    if (!chrome.ready) return;
    void api
      .me()
      .then((me) => setActorUserId(me.actor.userId))
      .catch(() => setActorUserId(null));
  }, [chrome.ready]);

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
            newClientId(),
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
            role: friendRole,
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
            idempotencyKey: newClientId(),
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
        eyebrow={NAV_LABELS.spaceGroup}
        title="خانه گروه و خانواده"
        description={`مانده و اعضا — ${NAV_LABELS.addExpense} از تب «${NAV_LABELS.expenses}» یا FAB.`}
      />
      <FlashMessages error={pageError} successMessage={successMessage} />

      {loading ? (
        <EmptyHint loading>در حال بارگذاری گروه…</EmptyHint>
      ) : (
        <ProductGrid>
          {workspace && canManageFinance ? (
            <SectionCard title={NAV_LABELS.invoices} delayClass="delay1" tone="quiet">
              <p className="liveHint">
                مادرخرج: دوره و صورتحساب اعضا در صفحهٔ جداگانهٔ صورتحساب است.
              </p>
              <Link href={invoicesHref} className="textButton">
                رفتن به {NAV_LABELS.invoices}
              </Link>
            </SectionCard>
          ) : null}

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
              <EmptyStateBlock
                title="هنوز خرجی ثبت نشده"
                description="با ثبت اولین خرج گروه، مانده هر عضو اینجا محاسبه و نمایش داده می‌شود."
                action={
                  <Button
                    type="button"
                    onClick={() => router.push(`${expensesHref}#quick-expense`)}
                  >
                    {NAV_LABELS.addExpense}
                  </Button>
                }
              />
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
            {chrome.workspaceId &&
            chrome.capabilities?.productFlags?.debtSimplifyApi ? (
              <DebtSimplifyPanel
                workspaceId={chrome.workspaceId}
                memberLabel={memberLabel}
                enabled
                onError={setError}
                onSuccess={flashSuccess}
                onApplied={() => {
                  void api.getBalances(chrome.workspaceId).then(setBalances).catch(() => null);
                }}
              />
            ) : null}
            <div className="dataRowActions">
              <Button
                type="button"
                onClick={() => router.push(settlementsHref)}
              >
                {NAV_LABELS.settlements}
              </Button>
            </div>
          </SectionCard>

          {/* Primary expense entry is tab/FAB — avoid a second competing CTA panel */}

          {chrome.capabilities?.productFlags?.addonAck && chrome.workspaceId ? (
            <AddonChargesPanel
              workspaceId={chrome.workspaceId}
              actorUserId={chrome.actor?.userId ?? null}
              members={members}
              onError={setError}
              onSuccess={flashSuccess}
            />
          ) : null}

          {chrome.capabilities?.productFlags?.allowance &&
          chrome.workspaceId &&
          canManageFinance ? (
            <AllowancesPanel
              workspaceId={chrome.workspaceId}
              members={members}
              onError={setError}
              onSuccess={flashSuccess}
            />
          ) : null}

          <SectionCard title="افزودن دوست" badge={members.length} delayClass="delay2">
            {!chrome.workspaceId ? (
              <EmptyHint>اول گروه بسازید یا انتخاب کنید.</EmptyHint>
            ) : (
              <>
                <FormStack>
                  <SelectField
                    label="نقش مهمان"
                    value={friendRole}
                    onChange={(event) =>
                      setFriendRole(event.target.value as "finance" | "member" | "guest")
                    }
                  >
                    <option value="finance">مادرخرج / پشتیبان</option>
                    <option value="member">عضو</option>
                    <option value="guest">مهمان موقت</option>
                  </SelectField>
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
            {!canManageFinance ? (
              <p className="liveHint">
                پیش‌فرض «همه» است — جمعی‌های گروه به‌علاوه خرج خصوصی خودتان؛ خصوصی دیگران را نمی‌بینید.
              </p>
            ) : null}
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
              onClick={() => router.push(`${expensesHref}#expense-panel`)}
            >
              مشاهده در خرج‌ها
            </Button>
          </SectionCard>
        </ProductGrid>
      )}
    </AppShell>
  );
}
