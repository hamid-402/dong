"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import type {
  ExpenseSummary,
  MembershipSummary,
  WorkspaceBalancesResponse,
  WorkspaceSubunitSummary,
  WorkspaceSummary,
} from "@dang/contracts";
import {
  buildingArrearsFromBalances,
  isFinanceManagerRole,
  isMembershipManagerRole,
  isReadOnlyRole,
  personaHomeSpec,
  spaceKindForTemplate,
} from "@dang/contracts";
import {
  Amount,
  Button,
  MoneyInput,
  TextField,
  formatMoneyWithUnit,
} from "@dang/ui";
import { AppShell } from "@/components/app-shell";
import {
  DataList,
  DataRow,
  EmptyHint,
  EmptyStateBlock,
  FormStack,
  SectionCard,
} from "@/components/ui-blocks";
import { ContentSkeleton } from "@/components/shell/content-skeleton";
import { GroupPublicIdCard } from "@/components/shell/group-public-id";
import { WorkspacePageFrame } from "@/components/shell/workspace-page-frame";
import { useOptionalWorkspaceScope } from "@/components/shell/workspace-scope";
import {
  SpaceHomeActivity,
  SpaceHomeActions,
  SpaceHomeKeyNumber,
  SpaceHomeLayout,
  spaceHomeKeyLabel,
  spaceHomePrimaryCta,
  type SpaceHomeActionItem,
  type SpaceHomeActivityItem,
} from "@/components/views/space-home";
import { spaceHomeStyles } from "@/components/views/space-home/space-home-layout";
import { modulesForTemplate } from "@/lib/workspace-modules";
import { api } from "@/lib/api";
import { normalizeYearMonthInput } from "@/lib/fa-datetime";
import { friendlyErrorMessage } from "@/lib/api-errors";
import { expenseHrefForUnit } from "@/lib/expense-unit-href";
import { hubPathFor } from "@/lib/hub-links";
import { newClientId } from "@/lib/id";
import {
  expenseStatusLabel,
  membershipRoleLabel,
} from "@/lib/status-labels";
import { useDisplayUnit } from "@/lib/display-unit";
import { displayInputToIrrMinor } from "@/lib/irr-money";
import { FlashMessages, useFlashMessage } from "@/lib/use-flash-message";
import { useAppChrome } from "@/lib/use-app-chrome";
import { wPath } from "@/lib/workspace-paths";

/**
 * Building-kind space home — SpaceHomeLayout; deep tools on section menu.
 */
export function BuildingSpaceView() {
  const chrome = useAppChrome();
  const displayUnit = useDisplayUnit();
  const scope = useOptionalWorkspaceScope();
  const { successMessage, error, setError, flashSuccess } = useFlashMessage();
  const [loading, setLoading] = useState(true);
  const [pending, startTransition] = useTransition();
  const [workspace, setWorkspace] = useState<WorkspaceSummary | null>(null);
  const [members, setMembers] = useState<MembershipSummary[]>([]);
  const [units, setUnits] = useState<WorkspaceSubunitSummary[]>([]);
  const [expenses, setExpenses] = useState<ExpenseSummary[]>([]);
  const [balances, setBalances] = useState<WorkspaceBalancesResponse | null>(
    null,
  );
  const [openSettlements, setOpenSettlements] = useState(0);
  const [myRole, setMyRole] = useState("");
  const [chargeYearMonth, setChargeYearMonth] = useState(() =>
    new Date().toISOString().slice(0, 7),
  );
  const [chargeAmount, setChargeAmount] = useState("");
  const [chargeAutoPost, setChargeAutoPost] = useState(false);

  const workspaceId = scope?.workspaceId || chrome.workspaceId;

  async function refresh(id: string) {
    const actorId = chrome.actor?.userId;
    const [memberList, subunitList, expenseList, bal, settlements, me] =
      await Promise.all([
        api.listMembers(id),
        api.listSubunits(id),
        api.listExpenses(id),
        api.getBalances(id).catch(() => null),
        api.listSettlements(id).catch(() => []),
        actorId ? Promise.resolve(null) : api.me(),
      ]);
    const userId = actorId ?? me!.actor.userId;
    setMembers(memberList.filter((m) => !m.disabledAt));
    setUnits(subunitList);
    setExpenses(expenseList);
    setBalances(bal);
    setOpenSettlements(
      settlements.filter((s) => s.status === "claimed" || s.status === "disputed")
        .length,
    );
    setMyRole(memberList.find((m) => m.userId === userId)?.role ?? "");
    setWorkspace(chrome.workspaces.find((w) => w.id === id) ?? null);
  }

  useEffect(() => {
    if (!chrome.ready) return;
    const scoped =
      chrome.workspaces.find((w) => w.id === workspaceId) ?? null;
    const isBuilding =
      scoped && spaceKindForTemplate(scoped.template) === "building";
    if (!isBuilding || !scoped) {
      setWorkspace(null);
      setMembers([]);
      setUnits([]);
      setExpenses([]);
      setBalances(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    void refresh(scoped.id)
      .then(() => setError(null))
      .catch((err: unknown) =>
        setError(friendlyErrorMessage(err, "بارگذاری خانه ساختمان ناموفق")),
      )
      .finally(() => setLoading(false));
  }, [chrome.ready, workspaceId, chrome.workspaces, chrome.actor?.userId]);

  const isConstruction = workspace?.template === "construction";
  const unitNoun = isConstruction ? "بخش / فاز" : "واحد";
  const unitNounPlural = isConstruction ? "بخش‌ها و فازها" : "واحدها";
  const canManage = isFinanceManagerRole(myRole);
  const canManageMembers = isMembershipManagerRole(myRole) && !isReadOnlyRole(myRole);
  const readOnly = isReadOnlyRole(myRole);
  const modules = modulesForTemplate(workspace?.template);
  const homeSpec = personaHomeSpec(myRole, "building", {
    approvalQueue: Boolean(chrome.capabilities?.productFlags?.approvalQueue),
    statementsLive:
      chrome.capabilities?.providers?.statements === "csv_json_print_v1",
    procurement: modules.has("procurement") || isConstruction,
    partners: modules.has("partnerships") || isConstruction,
  });

  const slug = workspace?.slug ?? scope?.slug ?? null;
  const unitsHref = slug ? wPath(slug, "subunits") : "/home?kind=building";
  const expensesHref = slug ? wPath(slug, "expenses") : hubPathFor("/workspaces");
  const settlementsHref = slug
    ? wPath(slug, "settlements")
    : `${hubPathFor("/workspaces")}#settlement-panel`;
  const invoicesHref = slug ? wPath(slug, "invoices") : hubPathFor("/workspaces");

  const buildingChargesLive =
    chrome.capabilities?.providers?.buildingCharges === "building_charges_v1";

  const arrears = useMemo(() => {
    if (!balances) return [];
    return buildingArrearsFromBalances(balances.lines, units);
  }, [balances, units]);

  const unitById = useMemo(() => {
    const map = new Map(units.map((u) => [u.id, u] as const));
    return map;
  }, [units]);

  const memberName = (userId: string) =>
    members.find((m) => m.userId === userId)?.displayName ?? userId.slice(0, 8);

  function onGenerateCharges() {
    if (!workspaceId) return;
    const amount = displayInputToIrrMinor(chargeAmount, displayUnit);
    if (!/^\d{4}-\d{2}$/.test(chargeYearMonth)) {
      setError("ماه شارژ نامعتبر است؛ مثلاً ۲۰۲۶/۱۰");
      return;
    }
    if (!amount) {
      setError("مبلغ شارژ هر واحد لازم است");
      return;
    }
    startTransition(() => {
      void (async () => {
        try {
          const result = await api.generateBuildingCharges(workspaceId, {
            yearMonth: chargeYearMonth,
            amountMinorPerUnit: amount.amountMinor,
            autoPost: chargeAutoPost,
            idempotencyKey: newClientId(),
          });
          await refresh(workspaceId);
          setError(null);
          flashSuccess(
            result.created.length > 0
              ? `${result.created.length.toLocaleString("fa-IR")} شارژ واحد صادر شد` +
                  (result.skipped.length
                    ? ` · ${result.skipped.length.toLocaleString("fa-IR")} رد شد/تکراری`
                    : "")
              : result.skipped.length > 0
                ? "شارژ جدیدی ساخته نشد (احتمالاً قبلاً صادر شده یا واحد بدون ساکن)"
                : "واحد قابل شارژی نبود",
          );
        } catch (err: unknown) {
          setError(friendlyErrorMessage(err, "صدور شارژ ماهانه ناموفق"));
        }
      })();
    });
  }

  const primary = spaceHomePrimaryCta("building", {
    buildingChargesLive: buildingChargesLive && !isConstruction,
  });
  const primaryHref =
    primary.prefer === "invoices"
      ? invoicesHref
      : slug
        ? wPath(slug, "record")
        : "/home";

  const actionItems = useMemo((): SpaceHomeActionItem[] => {
    const items: SpaceHomeActionItem[] = [];
    for (const row of arrears.slice(0, 5)) {
      items.push({
        id: row.userId,
        title: memberName(row.userId),
        detail: formatMoneyWithUnit(row.net.amountMinor, displayUnit),
        href: settlementsHref,
        actionLabel: "تسویه",
      });
    }
    if (items.length === 0 && openSettlements > 0) {
      items.push({
        id: "settlements",
        title: "تسویه باز",
        detail: `${openSettlements.toLocaleString("fa-IR")} مورد`,
        href: settlementsHref,
        actionLabel: "تسویه",
      });
    }
    return items.slice(0, 5);
  }, [arrears, openSettlements, settlementsHref, members, displayUnit]);

  const activityItems = useMemo((): SpaceHomeActivityItem[] => {
    return expenses.slice(0, 5).map((expense) => ({
      id: expense.id,
      title: expense.title,
      detail: `${expenseStatusLabel(expense.status)} · ${formatMoneyWithUnit(expense.total.amountMinor, displayUnit)}`,
      href: `${expensesHref}?expense=${encodeURIComponent(expense.id)}#expense-inspector`,
    }));
  }, [expenses, expensesHref, displayUnit]);

  const unpaidLabel =
    arrears.length > 0
      ? `${arrears.length.toLocaleString("fa-IR")} واحد/نفر بدهکار`
      : openSettlements > 0
        ? `${openSettlements.toLocaleString("fa-IR")} تسویه باز`
        : "بدهی بازی نیست";

  const pageError = error ?? chrome.error;

  return (
    <AppShell
      workspaceId={chrome.workspaceId}
      workspaceName={chrome.workspaceName || undefined}
      userName={chrome.userName || undefined}
      persistenceLabel={chrome.persistenceLabel}
    >
      <WorkspacePageFrame
        title=""
        state={!chrome.ready || loading ? "loading" : "ready"}
        loadingLabel="در حال بارگذاری خانه ساختمان…"
      >
        <FlashMessages error={pageError} successMessage={successMessage} />

        {loading ? (
          <ContentSkeleton rows={4} label="در حال بارگذاری…" />
        ) : !workspace ? (
          <SectionCard title="ساختمانی ندارید" delayClass="delay1">
            <EmptyStateBlock
              title="هنوز فضای ساختمان نساخته‌اید"
              description="قالب «ساختمان مسکونی» برای واحد و شارژ؛ «ساختمان و پیمانکاری» برای پروژه."
              action={
                <Link href="/spaces/new?kind=building">
                  <Button type="button">ساخت فضای ساختمان</Button>
                </Link>
              }
            />
          </SectionCard>
        ) : (
          <SpaceHomeLayout
            title={workspace.name}
            roleBadge={myRole ? membershipRoleLabel(myRole) : null}
            primaryAction={
              !readOnly && slug ? (
                <Link href={primaryHref} className="dang-btn dang-btn--md dang-btn--primary">
                  {primary.label}
                </Link>
              ) : undefined
            }
            secondaryAction={
              openSettlements > 0 || arrears.length > 0 ? (
                <Link
                  href={settlementsHref}
                  className="dang-btn dang-btn--md dang-btn--ghost"
                >
                  تسویه
                </Link>
              ) : null
            }
            keyNumber={
              <SpaceHomeKeyNumber
                label={spaceHomeKeyLabel("building", "settled")}
                amount={unpaidLabel}
                tone={
                  arrears.length > 0 || openSettlements > 0 ? "debt" : "settled"
                }
                meta={
                  <span>
                    {units.length.toLocaleString("fa-IR")} {unitNoun}
                    {" · "}
                    {members.length.toLocaleString("fa-IR")} عضو
                  </span>
                }
              />
            }
            actions={<SpaceHomeActions items={actionItems} />}
            activity={<SpaceHomeActivity items={activityItems} />}
            extras={
              <>
                {homeSpec?.panels.subunits !== false ? (
                  <SectionCard
                    title={unitNounPlural}
                    badge={units.length}
                    delayClass="delay1"
                  >
                    {units.length === 0 ? (
                      <EmptyHint>
                        {canManageMembers
                          ? `هنوز ${unitNoun}ای نیست — از مسیر ${unitNounPlural} بسازید.`
                          : `هنوز ${unitNoun}ای تعریف نشده.`}
                      </EmptyHint>
                    ) : (
                      <DataList>
                        {units.slice(0, 8).map((u) => (
                          <DataRow
                            key={u.id}
                            title={`${u.code} · ${u.name}`}
                            meta={`${u.memberUserIds.length.toLocaleString("fa-IR")} نفر`}
                            actions={
                              homeSpec?.canAddExpense !== false ? (
                                <Link
                                  href={expenseHrefForUnit(expensesHref, u.code, u.name)}
                                >
                                  <Button type="button" variant="ghost">
                                    ثبت خرج
                                  </Button>
                                </Link>
                              ) : null
                            }
                          />
                        ))}
                      </DataList>
                    )}
                    <Link href={unitsHref} className="textButton">
                      {canManageMembers
                        ? `مدیریت ${unitNounPlural}`
                        : `مشاهدهٔ ${unitNounPlural}`}
                    </Link>
                  </SectionCard>
                ) : null}

                {!isConstruction && arrears.length > 0 ? (
                  <SectionCard title="معوقات" badge={arrears.length} delayClass="delay1">
                    <DataList>
                      {arrears.slice(0, 8).map((row) => {
                        const unitLabels = row.subunitIds
                          .map((id) => unitById.get(id)?.code)
                          .filter(Boolean)
                          .join("، ");
                        return (
                          <DataRow
                            key={row.userId}
                            title={memberName(row.userId)}
                            meta={unitLabels || "بدون واحد متصل"}
                            trailing={<Amount irrMinor={row.net.amountMinor} />}
                            actions={
                              <Link href={settlementsHref}>
                                <Button type="button" variant="ghost">
                                  تسویه
                                </Button>
                              </Link>
                            }
                          />
                        );
                      })}
                    </DataList>
                  </SectionCard>
                ) : null}

                {!isConstruction && buildingChargesLive && canManage ? (
                  <SectionCard title="صدور شارژ ماهانه" delayClass="delay2">
                    <FormStack>
                      <TextField
                        label="ماه شارژ"
                        value={chargeYearMonth}
                        onChange={(e) => setChargeYearMonth(normalizeYearMonthInput(e.target.value))}
                        hint="مثلاً ۲۰۲۶/۱۰ (سال و ماه میلادی)"
                        dir="ltr"
                      />
                      <MoneyInput
                        label="مبلغ هر واحد"
                        value={chargeAmount}
                        onValueChange={setChargeAmount}
                      />
                      <label className="liveHint" style={{ display: "flex", gap: 8 }}>
                        <input
                          type="checkbox"
                          checked={chargeAutoPost}
                          onChange={(e) => setChargeAutoPost(e.target.checked)}
                        />
                        <span>ثبت مستقیم در دفترکل</span>
                      </label>
                      <Button
                        type="button"
                        disabled={pending}
                        onClick={onGenerateCharges}
                      >
                        صدور شارژ
                      </Button>
                    </FormStack>
                  </SectionCard>
                ) : null}

                {slug ? (
                  <details className={spaceHomeStyles.collapsedExtra}>
                    <summary>شناسهٔ عمومی فضا</summary>
                    <GroupPublicIdCard slug={slug} name={workspace.name} />
                  </details>
                ) : null}
              </>
            }
          />
        )}
      </WorkspacePageFrame>
    </AppShell>
  );
}
