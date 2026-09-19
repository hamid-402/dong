"use client";

import { newClientId } from "@/lib/id";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import type {
  ExpenseSummary,
  ExpenseVisibility,
  MembershipSummary,
  WorkspaceBalancesResponse,
  WorkspaceSummary,
} from "@dang/contracts";
import { isFinanceManagerRole, isReadOnlyRole } from "@dang/contracts";
import { Amount, Button, SelectField, TextField } from "@dang/ui";
import { WorkspacePageFrame } from "@/components/shell/workspace-page-frame";
import { AppShell } from "@/components/app-shell";
import {
  DataList,
  DataRow,
  EmptyHint,
  EmptyStateBlock,
  FormStack,
  ProductGrid,
  SectionCard,
  StatusLine,
  StatusPill,
} from "@/components/ui-blocks";
import { EmptyStateIllustration } from "@/components/ui/empty-state-illustration";
import { ContentSkeleton } from "@/components/shell/content-skeleton";
import { GuestPlaceholdersPanel } from "@/components/guest-placeholders-panel";
import { api } from "@/lib/api";
import { friendlyErrorMessage } from "@/lib/api-errors";
import { todayIsoLocal } from "@/lib/fa-datetime";
import { hubPathFor } from "@/lib/hub-links";
import { useLiveInvalidation } from "@/lib/live-invalidation";
import { memberStatementHref, statementsListHref } from "@/lib/statement-links";
import { wPath } from "@/lib/workspace-paths";
import { NAV_LABELS } from "@/lib/nav-labels";
import { expenseStatusLabel, membershipRoleLabel, workspaceTemplateLabel } from "@/lib/status-labels";
import { FlashMessages, useFlashMessage } from "@/lib/use-flash-message";
import { useAppChrome } from "@/lib/use-app-chrome";
import { templateSupportsCompanyExpenses } from "@/lib/workspace-modules";
import { AddonChargesPanel } from "@/components/views/friends-group/addon-charges-panel";
import { DebtSimplifyPanel } from "@/components/views/friends-group/debt-simplify-panel";
import { AllowancesPanel } from "@/components/allowances-panel";
import { GroupBalanceHero } from "@/components/shell/group-balance-hero";
import { GroupOpsRail } from "@/components/shell/group-ops-rail";
import { GroupPublicIdCard } from "@/components/shell/group-public-id";
import { GroupSetupChecklist } from "@/components/shell/group-setup-checklist";

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
  const [openSettlementCount, setOpenSettlementCount] = useState(0);
  const [filter, setFilter] = useState<ExpenseFilter>("all");
  const [groupName, setGroupName] = useState("");
  const [groupTemplate, setGroupTemplate] = useState<"friends_family" | "household">(
    "friends_family",
  );
  const [ownerDefaultShares, setOwnerDefaultShares] = useState("1");
  const [outingTitle, setOutingTitle] = useState("");
  const [outingBudgetToman, setOutingBudgetToman] = useState("");
  const [outingEndsOn, setOutingEndsOn] = useState("");
  const [outings, setOutings] = useState<
    Array<{
      id: string;
      title: string;
      total: { amountMinor: string };
      expenseIds: string[];
      budgetCapMinor?: string;
    }>
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
  const statementsLive =
    chrome.capabilities?.providers?.statements === "csv_json_print_v1";
  const statementsHref = slug ? statementsListHref(slug) : hubPathFor("/workspaces");
  const membersHref = slug ? wPath(slug, "members") : hubPathFor("/workspaces/invite");
  const myRole = members.find((m) => m.userId === actorUserId)?.role;
  const canManageFinance = isFinanceManagerRole(myRole);
  const readOnlySpace = isReadOnlyRole(myRole);

  async function refresh(workspaceId: string) {
    const [memberList, expenseList, balanceData, outingList, settlementList] =
      await Promise.all([
        api.listMembers(workspaceId),
        api.listExpenses(workspaceId),
        api.getBalances(workspaceId),
        api.listOutings(workspaceId).catch(() => []),
        api.listSettlements(workspaceId).catch(() => []),
      ]);
    const current = chrome.workspaces.find((item) => item.id === workspaceId) ?? null;
    setWorkspace((prev) => current ?? (prev?.id === workspaceId ? prev : null));
    setMembers(memberList);
    setExpenses(expenseList);
    setBalances(balanceData);
    setOutings(outingList);
    setOpenSettlementCount(
      settlementList.filter((s) => s.status === "claimed" || s.status === "disputed")
        .length,
    );
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

  // A group screen is shared by definition: whoever records the next expense,
  // everyone else's list and who-owes-whom move with it.
  useLiveInvalidation(["expenses", "balances", "settlements"], () => {
    if (!chrome.ready || !chrome.workspaceId) return;
    void refresh(chrome.workspaceId).catch(() => {
      // Keep the last good data on screen; the next push retries.
    });
  });

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
              ownerDefaultShares: Math.max(
                1,
                Math.min(100, Number(ownerDefaultShares) || 1),
              ),
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
          const budgetMinor =
            outingBudgetToman.trim() === ""
              ? undefined
              : String(Math.round(Number(outingBudgetToman.replaceAll(",", "")) * 10));
          if (outingBudgetToman.trim() && (!budgetMinor || !/^\d+$/.test(budgetMinor))) {
            setError("سقف بودجه تومان نامعتبر است");
            return;
          }
          const created = await api.createOuting(chrome.workspaceId, {
            title,
            occurredOn: todayIsoLocal(),
            startsOn: todayIsoLocal(),
            endsOn: outingEndsOn.trim() || undefined,
            budgetCapMinor: budgetMinor,
            idempotencyKey: newClientId(),
          });
          setOutingTitle("");
          setOutingBudgetToman("");
          setOutingEndsOn("");
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
      <WorkspacePageFrame
      title={NAV_LABELS.spaceGroup}
      kicker={
        workspace
          ? `${workspaceTemplateLabel(workspace.template)} · ${members.length.toLocaleString("fa-IR")} عضو`
          : undefined
      }
      description="مانده، اعضا و مسیر تسویه — از داده زنده همین فضا."
      primaryAction={slug ? <Link href={expensesHref}>{NAV_LABELS.addExpense}</Link> : <Link href="/spaces">{NAV_LABELS.spacesList}</Link>}
      state="ready"
    >
      <FlashMessages error={pageError} successMessage={successMessage} />

      {loading ? (
        <ContentSkeleton rows={4} label="در حال بارگذاری گروه…" />
      ) : (
        <ProductGrid>
          {workspace && balances && actorUserId ? (
            <GroupBalanceHero
              workspaceName={workspace.name}
              myNetMinor={
                balances.lines.find((l) => l.userId === actorUserId)?.net.amountMinor ?? "0"
              }
              peers={balances.lines
                .filter((l) => l.userId !== actorUserId)
                .map((l) => ({
                  userId: l.userId,
                  name: memberLabel(l.userId),
                  amountMinor: l.net.amountMinor,
                }))}
              settleHref={settlementsHref}
              expenseHref={`${expensesHref}#quick-expense`}
              simplifyHref="#group-settle"
              simplifyAvailable={Boolean(
                chrome.capabilities?.productFlags?.debtSimplifyApi,
              )}
              openSettlements={openSettlementCount}
              recentExpenses={expenses.slice(0, 5).map((e) => ({
                id: e.id,
                title: e.title,
                toman: Math.round(Number(e.total.amountMinor) / 10),
                status: e.status,
              }))}
            />
          ) : null}

          {slug ? (
            <>
              <GroupPublicIdCard
                slug={slug}
                name={workspace?.name}
              />
              <GroupSetupChecklist
                slug={slug}
                memberCount={members.length}
                financeManagerCount={members.filter(
                  (m) => !m.disabledAt && isFinanceManagerRole(m.role),
                ).length}
                postedCount={expenses.filter((e) => e.status === "posted").length}
                canManageMembers={
                  myRole === "owner" || myRole === "admin" || canManageFinance
                }
              />
              <GroupOpsRail
                slug={slug}
                spaceKind="group"
                memberCount={members.length}
                openSettlements={openSettlementCount}
                canManageMembers={
                  myRole === "owner" ||
                  myRole === "admin" ||
                  canManageFinance
                }
              />
            </>
          ) : null}

          {workspace && canManageFinance ? (
            <SectionCard title={NAV_LABELS.invoices} delayClass="delay1" tone="quiet">
              <p className="liveHint">
                مادرخرج:{" "}
                {statementsLive
                  ? `صورتحساب سهم‌محور اعضا در ${NAV_LABELS.statements}؛ `
                  : null}
                دوره‌های صورتحساب در {NAV_LABELS.invoices}.
              </p>
              <p className="liveHint" style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem" }}>
                {statementsLive ? (
                  <Link href={statementsHref} className="textButton">
                    رفتن به {NAV_LABELS.statements}
                  </Link>
                ) : null}
                <Link href={invoicesHref} className="textButton">
                  رفتن به {NAV_LABELS.invoices}
                </Link>
              </p>
            </SectionCard>
          ) : null}

          {workspace ? (
            <SectionCard title="اعضا و گروه" delayClass="delay1" tone="quiet">
              <StatusLine>
                {workspace.name} · {workspaceTemplateLabel(workspace.template)} ·{" "}
                {members.length.toLocaleString("fa-IR")} عضو
              </StatusLine>
              <p className="liveHint" style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem" }}>
                <Link href={`${membersHref}#member-add-panel`} className="textButton">
                  مدیریت اعضا و نقش‌ها
                </Link>
              </p>
              <details className="reportDetails">
                <summary>
                  <span>ساخت گروه دیگر</span>
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
                <TextField
                  label="سهم پیش‌فرض شما"
                  value={ownerDefaultShares}
                  onChange={(e) => setOwnerDefaultShares(e.target.value)}
                  hint="مثلاً ۲ برای والدین در خانواده — بعداً برای اعضا قابل ویرایش است"
                />
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
                illustration={<EmptyStateIllustration variant="no-expense" />}
                title="هنوز خرجی ثبت نشده"
                description="با ثبت اولین خرج گروه، مانده هر عضو اینجا محاسبه و نمایش داده می‌شود."
                action={
                  readOnlySpace ? undefined : (
                    <Button
                      type="button"
                      onClick={() => router.push(`${expensesHref}#quick-expense`)}
                    >
                      {NAV_LABELS.addExpense}
                    </Button>
                  )
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
                      actions={
                        slug && statementsLive ? (
                          <Link
                            className="textButton"
                            href={memberStatementHref(slug, line.userId)}
                          >
                            {NAV_LABELS.statements}
                          </Link>
                        ) : undefined
                      }
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
                currentUserId={chrome.actor?.userId}
                readOnly={readOnlySpace}
                canApplyClaims={canManageFinance}
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
              {slug && statementsLive ? (
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => router.push(statementsHref)}
                >
                  {NAV_LABELS.statements}
                </Button>
              ) : null}
            </div>
          </SectionCard>

          {/* Primary expense entry is tab/FAB — avoid a second competing CTA panel */}

          {chrome.capabilities?.productFlags?.addonAck && chrome.workspaceId ? (
            <AddonChargesPanel
              workspaceId={chrome.workspaceId}
              actorUserId={chrome.actor?.userId ?? null}
              members={members}
              readOnly={readOnlySpace}
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

          <SectionCard title="اعضا" badge={members.length} delayClass="delay2">
            {!chrome.workspaceId ? (
              <EmptyHint>اول گروه بسازید یا انتخاب کنید.</EmptyHint>
            ) : (
              <>
                {readOnlySpace ? (
                  <StatusLine>
                    نقش {membershipRoleLabel(myRole)} فقط مشاهده دارد — افزودن عضو از صفحهٔ اعضا برای
                    مدیران.
                  </StatusLine>
                ) : (
                  <div className="dataRowActions">
                    <Button type="button" onClick={() => router.push(`${membersHref}#member-add-panel`)}>
                      {NAV_LABELS.members} · افزودن
                    </Button>
                  </div>
                )}
                {members.length === 0 ? (
                  <EmptyStateBlock
                    title="هنوز عضوی نیست"
                    description="حداقل یک نفر دیگر را اضافه کنید تا خرج مشترک و تسویه معنا پیدا کند."
                    action={
                      !readOnlySpace ? (
                        <Button
                          type="button"
                          onClick={() => router.push(`${membersHref}#member-add-panel`)}
                        >
                          افزودن عضو
                        </Button>
                      ) : undefined
                    }
                  />
                ) : (
                  <DataList>
                    {members.map((member) => (
                      <DataRow
                        key={member.userId}
                        title={member.displayName}
                        meta={
                          workspace?.template === "household"
                            ? `${membershipRoleLabel(member.role)} · سهم پیش‌فرض ${member.defaultShares}`
                            : membershipRoleLabel(member.role)
                        }
                        trailing={
                          !readOnlySpace &&
                          canManageFinance &&
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
                            <StatusPill tone="ok">{membershipRoleLabel(member.role)}</StatusPill>
                          )
                        }
                      />
                    ))}
                  </DataList>
                )}
              </>
            )}
          </SectionCard>

          {chrome.workspaceId ? (
            <GuestPlaceholdersPanel
              workspaceId={chrome.workspaceId}
              readOnly={readOnlySpace}
              onError={setError}
              onSuccess={flashSuccess}
            />
          ) : null}

          <details className="reportDetails">
            <summary>
              <span>گردش چندخرجی (اختیاری)</span>
              <span>{outings.length}</span>
            </summary>
            <div className="reportDetails__body">
              {!chrome.workspaceId ? (
                <EmptyHint>اول گروه را فعال کنید.</EmptyHint>
              ) : readOnlySpace ? (
                <EmptyHint>
                  نقش {membershipRoleLabel(myRole)} فقط مشاهده دارد — ساخت گردش فعال نیست.
                </EmptyHint>
              ) : (
                <FormStack density="compact">
                  <TextField
                    label="عنوان گردش"
                    value={outingTitle}
                    onChange={(e) => setOutingTitle(e.target.value)}
                    hint="مثلاً بیرون‌رفتن جمعه = بستنی + ناهار"
                  />
                  <TextField
                    label="سقف بودجه (تومان، اختیاری)"
                    value={outingBudgetToman}
                    onChange={(e) => setOutingBudgetToman(e.target.value)}
                  />
                  <TextField
                    label="پایان بازه (YYYY-MM-DD، اختیاری)"
                    value={outingEndsOn}
                    onChange={(e) => setOutingEndsOn(e.target.value)}
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
                          پرداخت:{" "}
                          {expense.paymentLines && expense.paymentLines.length > 1
                            ? expense.paymentLines
                                .map(
                                  (line) =>
                                    `${memberLabel(line.userId)} ${Math.round(Number(line.amount.amountMinor) / 10).toLocaleString("fa-IR")}`,
                                )
                                .join(" · ")
                            : memberLabel(expense.paidByUserId)}
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
    
      </WorkspacePageFrame></AppShell>
  );
}
