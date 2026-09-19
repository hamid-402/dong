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
  isReadOnlyRole,
  spaceKindForTemplate,
} from "@dang/contracts";
import { Amount, Button, TextField } from "@dang/ui";
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
import { ContentSkeleton } from "@/components/shell/content-skeleton";
import { GroupOpsRail } from "@/components/shell/group-ops-rail";
import { GroupPublicIdCard } from "@/components/shell/group-public-id";
import { WorkspacePageFrame } from "@/components/shell/workspace-page-frame";
import { useOptionalWorkspaceScope } from "@/components/shell/workspace-scope";
import { api } from "@/lib/api";
import { friendlyErrorMessage } from "@/lib/api-errors";
import { expenseHrefForUnit } from "@/lib/expense-unit-href";
import { hubPathFor } from "@/lib/hub-links";
import { newClientId } from "@/lib/id";
import { NAV_LABELS } from "@/lib/nav-labels";
import {
  expenseStatusLabel,
  membershipRoleLabel,
  workspaceTemplateLabel,
} from "@/lib/status-labels";
import { FlashMessages, useFlashMessage } from "@/lib/use-flash-message";
import { useAppChrome } from "@/lib/use-app-chrome";
import { wPath } from "@/lib/workspace-paths";

/**
 * Home for building-kind spaces (residential_building / construction).
 * Not friends-group: units/phases first, then charges & settlement.
 */
export function BuildingSpaceView() {
  const chrome = useAppChrome();
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
  const [chargeToman, setChargeToman] = useState("");
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
  const pageTitle = isConstruction ? "خانه پروژه ساختمانی" : "خانه ساختمان";
  const pageDesc = isConstruction
    ? "مصالح، پیمان، تحویل و سهم شرکا — با ساختار بخش/فاز و مسیرهای واقعی runtime."
    : "واحدها، ساکنان، شارژ و قبوض مشترک — نه گروه دوستانه.";

  const slug = workspace?.slug ?? scope?.slug ?? null;
  const unitsHref = slug ? wPath(slug, "subunits") : "/spaces?kind=building";
  const membersHref = slug ? wPath(slug, "members") : hubPathFor("/workspaces/invite");
  const expensesHref = slug ? wPath(slug, "expenses") : hubPathFor("/workspaces");
  const settlementsHref = slug
    ? wPath(slug, "settlements")
    : `${hubPathFor("/workspaces")}#settlement-panel`;
  const invoicesHref = slug ? wPath(slug, "invoices") : hubPathFor("/workspaces");
  const procurementHref = slug
    ? wPath(slug, "procurement")
    : hubPathFor("/workspaces/procurement");
  const partnersHref = slug ? wPath(slug, "partners") : hubPathFor("/workspaces");

  const canManage = isFinanceManagerRole(myRole);
  const readOnly = isReadOnlyRole(myRole);
  const posted = expenses.filter((e) => e.status === "posted");
  const financeManagers = members.filter((m) => isFinanceManagerRole(m.role));

  const assignedResidentCount = useMemo(() => {
    const ids = new Set<string>();
    for (const u of units) {
      for (const id of u.memberUserIds) ids.add(id);
    }
    return ids.size;
  }, [units]);

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

  const buildingChargesLive =
    chrome.capabilities?.providers?.buildingCharges === "building_charges_v1";

  function onGenerateCharges() {
    if (!workspaceId) return;
    const toman = Number(chargeToman.replaceAll(",", ""));
    if (!/^\d{4}-\d{2}$/.test(chargeYearMonth)) {
      setError("ماه شارژ باید به صورت YYYY-MM باشد");
      return;
    }
    if (!Number.isFinite(toman) || toman <= 0) {
      setError("مبلغ شارژ هر واحد (تومان) لازم است");
      return;
    }
    startTransition(() => {
      void (async () => {
        try {
          const result = await api.generateBuildingCharges(workspaceId, {
            yearMonth: chargeYearMonth,
            amountMinorPerUnit: String(Math.round(toman) * 10),
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

  const setupSteps = useMemo(() => {
    const steps = [
      {
        key: "units",
        label: `تعریف ${unitNounPlural}`,
        done: units.length > 0,
        href: unitsHref,
        hint:
          units.length > 0
            ? `${units.length.toLocaleString("fa-IR")} مورد`
            : `حداقل یک ${unitNoun} بسازید`,
      },
      {
        key: "residents",
        label: isConstruction ? "افراد پروژه" : "ساکنان روی واحدها",
        done: assignedResidentCount > 0 || (isConstruction && members.length >= 2),
        href: unitsHref,
        hint:
          assignedResidentCount > 0
            ? `${assignedResidentCount.toLocaleString("fa-IR")} نفر روی ${unitNounPlural}`
            : `اعضا را از صفحهٔ ${unitNounPlural} به هر مورد وصل کنید`,
      },
      {
        key: "finance",
        label: "دو مدیر مالی",
        done: financeManagers.length >= 2,
        href: `${membersHref}#member-add-panel`,
        hint:
          financeManagers.length >= 2
            ? `${financeManagers.length.toLocaleString("fa-IR")} مدیر`
            : "برای افزودن عضو عادی حداقل دو مالک/ادمین/مادرخرج لازم است",
      },
      {
        key: "charge",
        label: isConstruction ? "اولین ثبت هزینه" : "اولین شارژ / قبض",
        done: posted.length > 0,
        href: `${expensesHref}#expense-panel`,
        hint:
          posted.length > 0
            ? `${posted.length.toLocaleString("fa-IR")} ثبت‌شده`
            : "از هزینهٔ فضا یک مورد ثبت کنید",
      },
    ];
    return steps.filter((s) => !s.done);
  }, [
    units.length,
    unitNoun,
    unitNounPlural,
    unitsHref,
    assignedResidentCount,
    isConstruction,
    members.length,
    financeManagers.length,
    membersHref,
    posted.length,
    expensesHref,
  ]);

  const pageError = error ?? chrome.error;

  return (
    <AppShell
      workspaceId={chrome.workspaceId}
      workspaceName={chrome.workspaceName || undefined}
      userName={chrome.userName || undefined}
      persistenceLabel={chrome.persistenceLabel}
    >
      <WorkspacePageFrame
        title={pageTitle}
        description={pageDesc}
        primaryAction={
          slug ? (
            <Link href={unitsHref}>{unitNounPlural}</Link>
          ) : (
            <Link href="/spaces/new?kind=building">{NAV_LABELS.createSpace}</Link>
          )
        }
        state={!chrome.ready || loading ? "loading" : "ready"}
        loadingLabel="در حال بارگذاری خانه ساختمان…"
      >
        <FlashMessages error={pageError} successMessage={successMessage} />

        {workspace && slug ? (
          <GroupOpsRail
            slug={slug}
            spaceKind="building"
            memberCount={members.length}
            openSettlements={openSettlements}
            canManageMembers={canManage}
            showSubunits
            subunitsHint={unitNounPlural}
          />
        ) : null}

        {loading ? (
          <ContentSkeleton rows={4} label="در حال بارگذاری…" />
        ) : !workspace ? (
          <ProductGrid>
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
          </ProductGrid>
        ) : (
          <ProductGrid>
            <SectionCard title="فضای فعال" delayClass="delay1">
              <StatusLine>
                <b>{workspace.name}</b> · {workspaceTemplateLabel(workspace.template)} ·
                نقش شما: {membershipRoleLabel(myRole)}
                {readOnly ? " · فقط مشاهده" : null}
              </StatusLine>
              <StatusLine>
                <StatusPill tone="ok">
                  {units.length.toLocaleString("fa-IR")} {unitNoun}
                </StatusPill>{" "}
                <StatusPill tone={members.length > 0 ? "ok" : "warn"}>
                  {members.length.toLocaleString("fa-IR")} عضو
                </StatusPill>{" "}
                <StatusPill tone={openSettlements > 0 ? "warn" : "ok"}>
                  {openSettlements.toLocaleString("fa-IR")} تسویه باز
                </StatusPill>
              </StatusLine>
              {balances ? (
                <StatusLine>
                  ماندهٔ شما:{" "}
                  <Amount
                    irrMinor={
                      balances.lines.find(
                        (b) => b.userId === chrome.actor?.userId,
                      )?.net.amountMinor ?? "0"
                    }
                  />
                </StatusLine>
              ) : null}
              <div className="dataRowActions">
                <Link href={unitsHref}>
                  <Button type="button">{unitNounPlural}</Button>
                </Link>
                <Link href={expensesHref}>
                  <Button type="button" variant="ghost">
                    {isConstruction ? NAV_LABELS.expenses : "شارژ و قبوض"}
                  </Button>
                </Link>
                <Link href={settlementsHref}>
                  <Button type="button" variant="ghost">
                    {NAV_LABELS.settlements}
                  </Button>
                </Link>
                <Link href={invoicesHref}>
                  <Button type="button" variant="ghost">
                    {NAV_LABELS.invoices}
                  </Button>
                </Link>
                {isConstruction ? (
                  <>
                    <Link href={procurementHref}>
                      <Button type="button" variant="ghost">
                        {NAV_LABELS.procurement}
                      </Button>
                    </Link>
                    <Link href={partnersHref}>
                      <Button type="button" variant="ghost">
                        {NAV_LABELS.partners}
                      </Button>
                    </Link>
                  </>
                ) : null}
                <Link href={membersHref}>
                  <Button type="button" variant="ghost">
                    {NAV_LABELS.members}
                  </Button>
                </Link>
              </div>
            </SectionCard>

            {slug ? (
              <GroupPublicIdCard slug={slug} name={workspace.name} />
            ) : null}

            {!isConstruction && arrears.length > 0 ? (
              <SectionCard
                title="تابلوی معوقات"
                badge={arrears.length}
                delayClass="delay1"
              >
                <EmptyHint>
                  از ماندهٔ واقعی دفترکل — بدهکاران با |net| منفی، بدون badge جعلی.
                </EmptyHint>
                <DataList>
                  {arrears.map((row) => {
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
            ) : !isConstruction && balances ? (
              <SectionCard title="تابلوی معوقات" delayClass="delay1">
                <EmptyHint>بدهکار بازی از balances نیست — همه تسویه یا صفرند.</EmptyHint>
              </SectionCard>
            ) : null}

            {!isConstruction && buildingChargesLive && canManage ? (
              <SectionCard title="صدور شارژ ماهانه واحدها" delayClass="delay2">
                <FormStack>
                  <TextField
                    label="ماه (YYYY-MM)"
                    value={chargeYearMonth}
                    onChange={(e) => setChargeYearMonth(e.target.value)}
                    dir="ltr"
                  />
                  <TextField
                    label="مبلغ هر واحد (تومان)"
                    value={chargeToman}
                    onChange={(e) => setChargeToman(e.target.value)}
                    dir="ltr"
                  />
                  <label className="liveHint" style={{ display: "flex", gap: 8 }}>
                    <input
                      type="checkbox"
                      checked={chargeAutoPost}
                      onChange={(e) => setChargeAutoPost(e.target.checked)}
                    />
                    <span>ثبت مستقیم در دفترکل (submit+post)</span>
                  </label>
                  <Button
                    type="button"
                    disabled={pending}
                    onClick={onGenerateCharges}
                  >
                    صدور شارژ برای همهٔ واحدهای دارای ساکن
                  </Button>
                </FormStack>
                <p className="liveHint">
                  هر واحد یک خرج جدا با کلید یکتای ماه می‌گیرد — اجرای دوباره همان ماه تکراری
                  نمی‌سازد.
                </p>
              </SectionCard>
            ) : null}

            {setupSteps.length > 0 ? (
              <SectionCard title="راه‌اندازی ساختمان" delayClass="delay1">
                <EmptyHint>
                  {setupSteps.length.toLocaleString("fa-IR")} مرحله مانده — از لینک‌های واقعی زیر.
                </EmptyHint>
                <DataList>
                  {setupSteps.map((step) => (
                    <DataRow
                      key={step.key}
                      title={step.label}
                      meta={step.hint}
                      actions={
                        <Link href={step.href}>
                          <Button type="button" variant="ghost">
                            انجام ←
                          </Button>
                        </Link>
                      }
                    />
                  ))}
                </DataList>
              </SectionCard>
            ) : null}

            <SectionCard
              title={unitNounPlural}
              badge={units.length}
              delayClass="delay2"
            >
              {units.length === 0 ? (
                <EmptyStateBlock
                  title={`هنوز ${unitNoun}ی نیست`}
                  description={
                    canManage
                      ? `از صفحهٔ ${unitNounPlural} کد و نام بسازید و ساکنان را وصل کنید.`
                      : "منتظر تعریف ساختار از مدیر فضا باشید."
                  }
                  action={
                    canManage ? (
                      <Link href={unitsHref}>
                        <Button type="button">رفتن به {unitNounPlural}</Button>
                      </Link>
                    ) : undefined
                  }
                />
              ) : (
                <>
                  <DataList>
                    {units.slice(0, 12).map((u) => (
                      <DataRow
                        key={u.id}
                        title={`${u.code} · ${u.name}`}
                        meta={
                          <>
                            {u.memberUserIds.length.toLocaleString("fa-IR")} نفر
                            {u.note ? ` · ${u.note}` : null}
                          </>
                        }
                        actions={
                          <Link href={expenseHrefForUnit(expensesHref, u.code, u.name)}>
                            <Button type="button" variant="ghost">
                              ثبت شارژ
                            </Button>
                          </Link>
                        }
                      />
                    ))}
                  </DataList>
                  {units.length > 12 ? (
                    <StatusLine>
                      و {(units.length - 12).toLocaleString("fa-IR")} مورد دیگر…
                    </StatusLine>
                  ) : null}
                  <FormStack>
                    <Link href={unitsHref}>
                      <Button type="button" variant="ghost">
                        مدیریت کامل {unitNounPlural}
                      </Button>
                    </Link>
                  </FormStack>
                </>
              )}
            </SectionCard>

            <SectionCard
              title={isConstruction ? "هزینه‌های اخیر" : "شارژ و قبوض اخیر"}
              badge={posted.length}
              delayClass="delay2"
            >
              {posted.length === 0 ? (
                <EmptyHint>
                  هنوز موردی از API ثبت نشده — از «{isConstruction ? "هزینه‌ها" : "شارژ و قبوض"}»
                  شروع کنید.
                </EmptyHint>
              ) : (
                <DataList>
                  {posted.slice(0, 8).map((e) => (
                    <DataRow
                      key={e.id}
                      title={e.title}
                      meta={
                        <StatusPill tone="ok">
                          {expenseStatusLabel(e.status)}
                        </StatusPill>
                      }
                      trailing={<Amount irrMinor={e.total.amountMinor} />}
                    />
                  ))}
                </DataList>
              )}
              <Link href={expensesHref}>مشاهده همه</Link>
            </SectionCard>

            <SectionCard title="اعضای فضا" badge={members.length} delayClass="delay3">
              {members.length === 0 ? (
                <EmptyHint>عضوی نیست.</EmptyHint>
              ) : (
                <DataList>
                  {members.slice(0, 10).map((m) => (
                    <DataRow
                      key={m.userId}
                      title={m.displayName}
                      meta={membershipRoleLabel(m.role)}
                    />
                  ))}
                </DataList>
              )}
              <Link href={membersHref}>{NAV_LABELS.members}</Link>
            </SectionCard>
          </ProductGrid>
        )}
      </WorkspacePageFrame>
    </AppShell>
  );
}
