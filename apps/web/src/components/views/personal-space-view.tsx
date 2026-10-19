"use client";

import Link from "next/link";
import { newClientId } from "@/lib/id";

import { useEffect, useMemo, useState, useTransition } from "react";
import type {
  ExpenseSummary,
  MembershipSummary,
  PersonalSavingsFundSummary,
  WorkspaceMoneyPulse,
  WorkspaceSummary,
} from "@dang/contracts";
import { resolveDailyLedgerRange, spaceKindForTemplate } from "@dang/contracts";
import {
  Amount,
  Button,
  MoneyInput,
  TextField,
  formatMoneyWithUnit,
  usePrompt,
} from "@dang/ui";
import { WorkspacePageFrame } from "@/components/shell/workspace-page-frame";
import { TreasuryBalanceCard } from "@/components/shell/treasury-balance-card";
import { AppShell } from "@/components/app-shell";
import {
  SplitComposer,
  emptySplitComposer,
  type SplitComposerValue,
} from "@/components/split-composer";
import {
  DataList,
  DataRow,
  EmptyHint,
  FormStack,
  StatusPill,
} from "@/components/ui-blocks";
import { ContentSkeleton } from "@/components/shell/content-skeleton";
import { PersonalSpacesAccordion } from "@/components/shell/personal-spaces-accordion";
import {
  SpaceHomeActivity,
  SpaceHomeActions,
  SpaceHomeKeyNumber,
  SpaceHomeLayout,
  SpaceHomeMiniChart,
  spaceHomeKeyLabel,
  type SpaceHomeActionItem,
  type SpaceHomeActivityItem,
} from "@/components/views/space-home";
import { moneyPulseFlowSeries } from "@dang/contracts";
import { api } from "@/lib/api";
import { friendlyErrorMessage } from "@/lib/api-errors";
import { todayIsoLocal } from "@/lib/fa-datetime";
import { useDisplayUnit } from "@/lib/display-unit";
import { displayInputToIrrMinor } from "@/lib/irr-money";
import { createWorkspaceWithUniqueSlug } from "@/lib/group-slug";
import { NAV_LABELS } from "@/lib/nav-labels";
import { expenseStatusLabel } from "@/lib/status-labels";
import { useFlashMessage } from "@/lib/use-flash-message";
import { useAppChrome } from "@/lib/use-app-chrome";
import { usePersonalFinanceHashScroll } from "@/lib/use-personal-finance-hash-scroll";
import { useOptionalWorkspaceScope } from "@/components/shell/workspace-scope";
import { wPath } from "@/lib/workspace-paths";
import { netFromIrrMinor } from "@/lib/space-net-balance";

const initialSplit: SplitComposerValue = emptySplitComposer("private");

/** Personal space home — SpaceHomeLayout + quick expense + savings. */
export function PersonalSpaceView() {
  const chrome = useAppChrome();
  const displayUnit = useDisplayUnit();
  const promptText = usePrompt();
  usePersonalFinanceHashScroll();
  const scope = useOptionalWorkspaceScope();
  const { successMessage, error, setError, flashSuccess } = useFlashMessage();
  const [loading, setLoading] = useState(true);
  const [workspace, setWorkspace] = useState<WorkspaceSummary | null>(null);
  const [members, setMembers] = useState<MembershipSummary[]>([]);
  const [expenses, setExpenses] = useState<ExpenseSummary[]>([]);
  const [categories, setCategories] = useState<Array<{ id: string; name: string }>>([]);
  const [categoryId, setCategoryId] = useState("");
  const [currentUserId, setCurrentUserId] = useState("");
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [split, setSplit] = useState<SplitComposerValue>(initialSplit);
  const [pending, startTransition] = useTransition();
  const [savingsFund, setSavingsFund] = useState<PersonalSavingsFundSummary | null>(
    null,
  );
  const [moneyPulse, setMoneyPulse] = useState<WorkspaceMoneyPulse | null>(null);
  const goalsLive = chrome.capabilities?.providers?.savingsGoals === "goals_v1";
  const chartsLive = chrome.capabilities?.providers?.charts === "charts_v1";

  async function refreshSavings() {
    if (!goalsLive) {
      setSavingsFund(null);
      return;
    }
    const fund = await api.getSavingsFund().catch(() => null);
    setSavingsFund(fund);
  }

  async function refresh(workspaceId: string) {
    const actorId = chrome.actor?.userId;
    const month = resolveDailyLedgerRange("month");
    const [memberList, expenseList, cats, me, dashboard] = await Promise.all([
      api.listMembers(workspaceId),
      api.listExpenses(workspaceId),
      api.listCategories(workspaceId).catch(() => []),
      actorId ? Promise.resolve(null) : api.me(),
      api.workspaceDashboard(workspaceId, month.from, month.to).catch(() => null),
    ]);
    const userId = actorId ?? me!.actor.userId;
    setMembers(memberList);
    setExpenses(expenseList.filter((e) => e.visibility === "private" || e.visibility === "shared"));
    setCategories(cats);
    setCurrentUserId(userId);
    setMoneyPulse(dashboard?.moneyPulse ?? null);
    setSplit((prev) => ({
      ...prev,
      visibility: "private",
      participantUserIds: [userId],
    }));
    const current = chrome.workspaces.find((w) => w.id === workspaceId) ?? null;
    setWorkspace(current);
  }

  useEffect(() => {
    if (!chrome.ready) return;
    const scoped = scope?.workspaceId
      ? chrome.workspaces.find((w) => w.id === scope.workspaceId) ?? null
      : chrome.workspaces.find((w) => w.id === chrome.workspaceId) ?? null;
    const isPersonal = scoped && spaceKindForTemplate(scoped.template) === "personal";
    if (!isPersonal || !scoped) {
      setWorkspace(null);
      setMembers([]);
      setExpenses([]);
      setMoneyPulse(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    void Promise.all([refresh(scoped.id), refreshSavings()])
      .then(() => setError(null))
      .catch((err: unknown) => setError(friendlyErrorMessage(err, "خطا")))
      .finally(() => setLoading(false));
  }, [chrome.ready, chrome.workspaceId, chrome.workspaces, scope?.workspaceId, chrome.actor?.userId, goalsLive]);

  function onEnsurePersonal() {
    startTransition(() => {
      void (async () => {
        try {
          const created = await createWorkspaceWithUniqueSlug(
            { name: "دفتر من", template: "personal" },
            (body) => api.createWorkspace(body, newClientId()),
          );
          chrome.selectWorkspace(created.id);
          chrome.refreshChrome();
          flashSuccess("فضای شخصی ساخته شد");
          await refresh(created.id);
        } catch (err: unknown) {
          setError(friendlyErrorMessage(err, "ساخت فضای شخصی ناموفق"));
        }
      })();
    });
  }

  function onCreateExpense() {
    if (!workspace) return;
    const name = title.trim();
    const total = displayInputToIrrMinor(amount, displayUnit);
    if (!name) {
      setError("عنوان لازم است");
      return;
    }
    if (!total) {
      setError("مبلغ نامعتبر است");
      return;
    }
    startTransition(() => {
      void (async () => {
        try {
          const me = await api.me();
          const created = await api.createExpenseDraft(workspace.id, {
            workspaceId: workspace.id,
            title: name,
            total,
            paidByUserId: me.actor.userId,
            splitMethod: "equal",
            participantUserIds: [me.actor.userId],
            splitLines: undefined,
            occurredOn: todayIsoLocal(),
            visibility: "private",
            categoryId: categoryId || undefined,
            idempotencyKey: newClientId(),
          });
          await api.submitExpense(workspace.id, created.id);
          await api.postExpense(workspace.id, created.id);
          setTitle("");
          setAmount("");
          flashSuccess("خرج شخصی ثبت و در دفتر اعمال شد");
          await refresh(workspace.id);
        } catch (err: unknown) {
          setError(friendlyErrorMessage(err, "ثبت خرج ناموفق"));
        }
      })();
    });
  }

  const pageError = error ?? chrome.error;
  const slug = workspace?.slug ?? scope?.slug ?? null;
  const pulseNet = moneyPulse
    ? netFromIrrMinor(moneyPulse.net.amountMinor, displayUnit)
    : null;

  const actionItems = useMemo((): SpaceHomeActionItem[] => {
    const items: SpaceHomeActionItem[] = [];
    const drafts = expenses.filter((e) => e.status === "draft" || e.status === "submitted");
    for (const expense of drafts.slice(0, 5)) {
      items.push({
        id: expense.id,
        title: expense.title,
        detail: `${expenseStatusLabel(expense.status)} · ${formatMoneyWithUnit(expense.total.amountMinor, displayUnit)}`,
        href: slug
          ? `${wPath(slug, "expenses")}?expense=${encodeURIComponent(expense.id)}#expense-inspector`
          : "/me/finance",
        actionLabel: "ادامه",
      });
    }
    return items;
  }, [expenses, slug, displayUnit]);

  const activityItems = useMemo((): SpaceHomeActivityItem[] => {
    return expenses.slice(0, 5).map((expense) => ({
      id: expense.id,
      title: expense.title,
      detail: `${expenseStatusLabel(expense.status)} · ${formatMoneyWithUnit(expense.total.amountMinor, displayUnit)}`,
      href: slug
        ? `${wPath(slug, "expenses")}?expense=${encodeURIComponent(expense.id)}#expense-inspector`
        : undefined,
    }));
  }, [expenses, slug, displayUnit]);

  const chartSeries = useMemo(() => {
    if (!chartsLive || !moneyPulse) return null;
    const series = moneyPulseFlowSeries(moneyPulse.movements);
    return series.points.length > 0 ? series : null;
  }, [chartsLive, moneyPulse]);

  return (
    <AppShell
      workspaceId={chrome.workspaceId}
      workspaceName={chrome.workspaceName || undefined}
      userName={chrome.userName || undefined}
      persistenceLabel={chrome.persistenceLabel}
    >
      <WorkspacePageFrame title="" state="ready">
        {pageError ? <p className="liveError">{pageError}</p> : null}
        {successMessage ? <p className="liveSuccess">{successMessage}</p> : null}

        {loading ? (
          <ContentSkeleton rows={4} label="در حال بارگذاری دفتر شخصی…" />
        ) : !workspace ? (
          <FormStack>
            <EmptyHint>هنوز فضای شخصی ندارید.</EmptyHint>
            <Button type="button" onClick={onEnsurePersonal} disabled={pending}>
              ساخت دفتر من
            </Button>
          </FormStack>
        ) : (
          <SpaceHomeLayout
            title={workspace.name || "دفتر من"}
            roleBadge="شخصی"
            primaryAction={
              slug ? (
                <Link
                  href={wPath(slug, "record")}
                  className="dang-btn dang-btn--md dang-btn--primary"
                >
                  ثبت خرج
                </Link>
              ) : (
                <Link href="/spaces">{NAV_LABELS.spacesList}</Link>
              )
            }
            secondaryAction={
              <Link href="/me/finance#goals" className="dang-btn dang-btn--md dang-btn--ghost">
                پس‌انداز
              </Link>
            }
            keyNumber={
              <SpaceHomeKeyNumber
                label={spaceHomeKeyLabel("personal", pulseNet?.tone ?? "settled")}
                amount={
                  !pulseNet
                    ? "—"
                    : pulseNet.tone === "settled"
                      ? "صفر"
                      : `${pulseNet.tone === "credit" ? "+" : "−"}${formatMoneyWithUnit(Math.abs(pulseNet.irrMinor), displayUnit)}`
                }
                tone={pulseNet?.tone ?? "settled"}
                meta={
                  moneyPulse ? (
                    <>
                      <span>
                        درآمد{" "}
                        {formatMoneyWithUnit(moneyPulse.income.amountMinor, displayUnit)}
                      </span>
                      <span>
                        خرج{" "}
                        {formatMoneyWithUnit(moneyPulse.expense.amountMinor, displayUnit)}
                      </span>
                    </>
                  ) : null
                }
              />
            }
            actions={<SpaceHomeActions items={actionItems} />}
            activity={<SpaceHomeActivity items={activityItems} />}
            chart={
              chartSeries && slug ? (
                <SpaceHomeMiniChart slug={slug} series={chartSeries} />
              ) : null
            }
            extras={
              <>
                <section id="personal-expense" aria-labelledby="personal-quick-expense">
                  <h2 id="personal-quick-expense" style={{ fontSize: "0.95rem", margin: "0 0 0.5rem" }}>
                    ثبت سریع خرج
                  </h2>
                  <FormStack>
                    <TextField
                      label="عنوان"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                    />
                    <MoneyInput
                      label="مبلغ"
                      value={amount}
                      onValueChange={setAmount}
                    />
                    {categories.length > 0 ? (
                      <label className="field">
                        <span>دسته</span>
                        <select
                          value={categoryId}
                          onChange={(e) => setCategoryId(e.target.value)}
                        >
                          <option value="">بدون دسته</option>
                          {categories.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                        </select>
                      </label>
                    ) : null}
                    <SplitComposer
                      members={members}
                      totalToman={amount}
                      value={split}
                      onChange={setSplit}
                      personalOnly
                      currentUserId={currentUserId}
                    />
                    <Button type="button" onClick={onCreateExpense} disabled={pending}>
                      ثبت خرج خصوصی
                    </Button>
                  </FormStack>
                </section>

                <TreasuryBalanceCard
                  spaceKind="personal"
                  funds={[]}
                  paymentsHref={slug ? wPath(slug, "payments") : "/me/finance#goals"}
                  savingsHref="/me/finance#goals"
                  canManage={goalsLive}
                  pending={pending}
                  savingsBalanceMinor={
                    goalsLive ? (savingsFund?.balanceMinor ?? "0") : null
                  }
                  savingsGoalCount={savingsFund?.goalCount ?? 0}
                  onEnsureSavings={
                    goalsLive
                      ? () => {
                          startTransition(() => {
                            void (async () => {
                              try {
                                const result = await api.ensureDefaultSavingsFund({
                                  idempotencyKey: crypto.randomUUID(),
                                });
                                setSavingsFund(result.fund);
                                flashSuccess(
                                  result.created
                                    ? "صندوق پس‌انداز ایجاد شد"
                                    : "صندوق پس‌انداز از قبل وجود داشت",
                                );
                              } catch (err) {
                                setError(
                                  friendlyErrorMessage(err, "ایجاد صندوق پس‌انداز ناموفق"),
                                );
                              }
                            })();
                          });
                        }
                      : undefined
                  }
                  onDepositSavings={
                    goalsLive
                      ? () => {
                          void promptText({
                            title: "واریز ماهانه",
                            label: "مبلغ",
                            confirmLabel: "ثبت واریز",
                            tone: "default",
                          }).then((raw) => {
                            if (raw == null) return;
                            const money = displayInputToIrrMinor(raw, displayUnit);
                            if (!money) {
                              setError("مبلغ معتبر نیست");
                              return;
                            }
                            startTransition(() => {
                              void (async () => {
                                try {
                                  const result = await api.depositSavingsFund({
                                    amountMinor: money.amountMinor,
                                    note: "واریز ماهانه",
                                    idempotencyKey: crypto.randomUUID(),
                                  });
                                  setSavingsFund(result.fund);
                                  flashSuccess("واریز در صندوق پس‌انداز ثبت شد");
                                } catch (err) {
                                  setError(
                                    friendlyErrorMessage(err, "واریز پس‌انداز ناموفق"),
                                  );
                                }
                              })();
                            });
                          });
                        }
                      : undefined
                  }
                />

                <div id="spaces">
                  <PersonalSpacesAccordion focus="share" hidePersonal />
                </div>

                {expenses.length > 0 ? (
                  <DataList>
                    {expenses.slice(0, 8).map((expense) => (
                      <DataRow
                        key={expense.id}
                        title={expense.title}
                        meta={
                          <StatusPill tone={expense.status === "posted" ? "ok" : "warn"}>
                            {expenseStatusLabel(expense.status)}
                          </StatusPill>
                        }
                        trailing={<Amount irrMinor={expense.total.amountMinor} />}
                      />
                    ))}
                  </DataList>
                ) : null}
              </>
            }
          />
        )}
      </WorkspacePageFrame>
    </AppShell>
  );
}
