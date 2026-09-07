"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { spaceKindForTemplate } from "@dang/contracts";
import { formatToman } from "@dang/ui";
import { AppShell, ShellIconSvg } from "@/components/app-shell";
import {
  HeroBalance,
  PageHeader,
  PanelList,
  QuickAction,
} from "@/components/ui-blocks";
import { api, getDevIdentity, setDevIdentity } from "@/lib/api";
import { friendlyErrorMessage } from "@/lib/api-errors";
import { hubPathFor } from "@/lib/hub-links";
import { wPath } from "@/lib/workspace-paths";
import { NAV_LABELS } from "@/lib/nav-labels";
import {
  expenseStatusLabel,
  needStatusLabel,
} from "@/lib/status-labels";
import { useAppChrome } from "@/lib/use-app-chrome";
import { FlashMessages } from "@/lib/use-flash-message";

function useAnimatedBalance(target: number, motionEnabled: boolean, ready: boolean) {
  const [mounted, setMounted] = useState(false);
  const [value, setValue] = useState(target);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted || !ready) return;
    if (!motionEnabled) {
      setValue(target);
      return;
    }

    setValue(0);
    const startedAt = performance.now();
    const duration = 1100;
    let frameId = 0;

    const update = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.round(target * eased));
      if (progress < 1) frameId = requestAnimationFrame(update);
    };

    frameId = requestAnimationFrame(update);
    return () => cancelAnimationFrame(frameId);
  }, [mounted, motionEnabled, ready, target]);

  if (!ready) return "—";
  return formatToman(value);
}

function MobileExpensePreview({
  amountLabel,
  payerName,
  title,
  members,
  financeHref,
}: {
  amountLabel: string;
  payerName: string;
  title: string;
  members: string[];
  financeHref: string;
}) {
  return (
    <aside className="phoneWrap" aria-label="پیش‌نمایش فرم موبایل">
      <div className="phone">
        <div className="phoneScreen">
          <div className="phoneStatus">
            <span>9:41</span>
            <span>● ● ●</span>
          </div>
          <div className="phoneHeader">
            <small>مرحله ۱ از ۲</small>
            <h2>ثبت خرج جدید</h2>
          </div>
          <div className="phoneBody">
            <div className="stepper">
              <span className="step">۱</span>
              <span />
              <span className="step off">۲</span>
            </div>
            <label className="field">
              <span>مبلغ</span>
              <div className="input amountInput">
                <b>{amountLabel}</b>
                <small>تومان</small>
              </div>
            </label>
            <label className="field">
              <span>پرداخت‌کننده</span>
              <div className="input">
                <b>{payerName}</b>
                <small>⌄</small>
              </div>
            </label>
            <label className="field">
              <span>عنوان خرج</span>
              <div className="input">
                <b>{title}</b>
              </div>
            </label>
            <div className="field">
              <span>افراد سهیم</span>
              <div className="memberRow">
                {members.length === 0 ? (
                  <span className="member selected">شما</span>
                ) : (
                  members.slice(0, 4).map((name, index) => (
                    <span className={index < 3 ? "member selected" : "member"} key={name}>
                      {name}
                    </span>
                  ))
                )}
              </div>
            </div>
            <div className="field">
              <span>روش تقسیم</span>
              <div className="choices">
                <span className="selected">مساوی</span>
                <span>سفارشی</span>
              </div>
            </div>
            <Link
              className="primaryButton"
              href={financeHref}
              style={{ display: "grid", placeItems: "center", textDecoration: "none" }}
            >
              ادامه در مالی
            </Link>
          </div>
        </div>
      </div>
    </aside>
  );
}

type DashboardState = {
  workspaceId: string;
  workspaceName: string;
  userName: string;
  balanceToman: number;
  postedCount: number;
  postedSpendToman: number;
  openSettlementCount: number;
  needCount: number;
  notificationCount: number;
  persistence: string;
  recentExpenses: Array<{ id: string; title: string; toman: number; status: string }>;
  recentNeeds: Array<{ id: string; title: string; status: string }>;
  memberNames: string[];
  previewExpenseTitle: string;
  previewExpenseToman: string;
  rangeLabel: string;
};

export function OverviewView() {
  const router = useRouter();
  const chrome = useAppChrome();
  const [motionEnabled, setMotionEnabled] = useState(true);
  const [data, setData] = useState<DashboardState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [allowDemoSeed, setAllowDemoSeed] = useState(false);
  const [pending, startTransition] = useTransition();
  const balance = useAnimatedBalance(data?.balanceToman ?? 0, motionEnabled, Boolean(data));
  const activeWs = chrome.workspaces.find((w) => w.id === chrome.workspaceId);
  const slug = activeWs?.slug ?? null;
  const expensesHref = slug ? `${wPath(slug, "expenses")}#quick-expense` : hubPathFor("/workspaces");
  const financeHref = slug ? wPath(slug, "expenses") : hubPathFor("/workspaces");
  const spaceHref = slug ? wPath(slug, "space") : hubPathFor("/group");
  const ledgerHref = slug ? wPath(slug, "ledger") : hubPathFor("/daily-ledger");
  const procurementHref = slug ? wPath(slug, "procurement") : hubPathFor("/workspaces/procurement");
  const settlementsHref = slug
    ? wPath(slug, "settlements")
    : `${hubPathFor("/workspaces")}#settlement-panel`;

  function load(workspaceId: string) {
    startTransition(() => {
      void (async () => {
        try {
          const identity = getDevIdentity();
          setDevIdentity(identity.subject, identity.displayName);
          // AppChrome already loaded workspaces/capabilities — only fetch page data.
          const workspace =
            chrome.workspaces.find((item) => item.id === workspaceId) ??
            chrome.workspaces[0];
          if (!workspace) {
            setError("فضای کاری ندارید — یک فضا بسازید یا از دعوت استفاده کنید.");
            setData(null);
            return;
          }
          const [dashboard, needs, members] = await Promise.all([
            api.workspaceDashboard(workspace.id),
            api.listNeeds(workspace.id).catch(() => []),
            api.listMembers(workspace.id).catch(() => []),
          ]);
          setAllowDemoSeed(chrome.allowDevAuth);
          const netMinor = Number(dashboard.actorNet.amountMinor);
          const firstExpense = dashboard.activity.recentExpenses[0];
          const sourceBits = [
            dashboard.source.expense,
            dashboard.source.ledger,
            dashboard.source.settlement,
            dashboard.source.notification,
          ];
          const allPostgres = sourceBits.every((s) => s === "postgres");
          const allMemory = sourceBits.every((s) => s === "memory");
          const persistence = allPostgres
            ? "ذخیره‌سازی پایدار"
            : allMemory
              ? "حافظه موقت"
              : `مختلط (${sourceBits.filter((s) => s === "postgres").length}/4 پایدار)`;
          setData({
            workspaceId: dashboard.workspaceId,
            workspaceName: dashboard.workspaceName,
            userName: chrome.userName || identity.displayName,
            balanceToman: Math.round(netMinor / 10),
            postedCount: dashboard.spend.postedCount,
            postedSpendToman: Math.round(
              Number(dashboard.spend.postedTotal.amountMinor) / 10,
            ),
            openSettlementCount: dashboard.settlements.openCount,
            needCount: needs.length,
            notificationCount: dashboard.activity.unreadNotifications,
            persistence,
            recentExpenses: dashboard.activity.recentExpenses.slice(0, 5).map((e) => ({
              id: e.id,
              title: e.title,
              toman: Math.round(Number(e.total.amountMinor) / 10),
              status: expenseStatusLabel(e.status),
            })),
            recentNeeds: needs.slice(0, 3).map((n) => ({
              id: n.id,
              title: n.title,
              status: needStatusLabel(n.status),
            })),
            memberNames: members.map((m) => m.displayName).filter(Boolean),
            previewExpenseTitle: firstExpense?.title ?? "—",
            previewExpenseToman: firstExpense
              ? formatToman(Math.round(Number(firstExpense.total.amountMinor) / 10)).replace(
                  " تومان",
                  "",
                )
              : "—",
            rangeLabel: `${dashboard.from} تا ${dashboard.to}`,
          });
          setError(null);
        } catch (err: unknown) {
          setError(friendlyErrorMessage(err, "خطای ناشناخته"));
        }
      })();
    });
  }

  const [todayLabel, setTodayLabel] = useState("");
  useEffect(() => {
    setTodayLabel(
      new Intl.DateTimeFormat("fa-IR", {
        weekday: "long",
        day: "numeric",
        month: "long",
      }).format(new Date()),
    );
  }, []);

  useEffect(() => {
    if (!chrome.ready || !chrome.workspaceId) return;
    load(chrome.workspaceId);
  }, [chrome.ready, chrome.workspaceId]);

  const spaceKind = spaceKindForTemplate(activeWs?.template);

  return (
    <AppShell
      workspaceId={data?.workspaceId}
      workspaceName={data?.workspaceName}
      userName={data?.userName}
      persistenceLabel={data ? data.persistence : "در حال بارگذاری…"}
      motionOff={!motionEnabled}
      notificationUnreadCount={data?.notificationCount ?? 0}
      rail={
        <MobileExpensePreview
          amountLabel={data?.previewExpenseToman ?? "—"}
          payerName={data?.userName ?? "—"}
          title={data?.previewExpenseTitle ?? "—"}
          members={data?.memberNames ?? []}
          financeHref={financeHref}
        />
      }
    >
      <PageHeader
        eyebrow="نمای کلی همکاری"
        title={`صبح بخیر${data?.userName ? `، ${data.userName.split(" ")[0]}` : ""}`}
        description={
          data
            ? `${formatToman(data.postedSpendToman)} خرج ثبت‌شده (${data.postedCount}) · ${data.openSettlementCount} تسویه باز · ${data.notificationCount} اعلان · بازه ${data.rangeLabel}`
            : "در حال همگام‌سازی…"
        }
        actions={
          <>
            <time suppressHydrationWarning>{todayLabel || "—"}</time>
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                if (chrome.workspaceId) load(chrome.workspaceId);
              }}
            >
              نوسازی
            </button>
            {allowDemoSeed ? (
              <button
                type="button"
                disabled={pending}
                onClick={() => {
                  startTransition(() => {
                    void (async () => {
                      try {
                        await api.seedDemo();
                        if (chrome.workspaceId) load(chrome.workspaceId);
                      } catch (err: unknown) {
                        setError(err instanceof Error ? err.message : "خطای seed");
                      }
                    })();
                  });
                }}
              >
                دادهٔ نمونه (دمو)
              </button>
            ) : null}
            <button type="button" onClick={() => setMotionEnabled((c) => !c)}>
              {motionEnabled ? "توقف حرکت" : "فعال‌کردن حرکت"}
            </button>
          </>
        }
      />

      <FlashMessages error={error} />

      <div className="heroGrid">
        <HeroBalance
          label="مانده خالص شما"
          amount={balance}
          subtitle={(data?.balanceToman ?? 0) >= 0 ? "تومان طلب دارید" : "تومان بدهکارید"}
          actionLabel={NAV_LABELS.settlements}
          onAction={() => router.push(settlementsHref)}
          hint={data ? data.persistence : "در حال بارگذاری…"}
        />
        <QuickAction
          title={spaceKind === "personal" ? "خرج خصوصی" : NAV_LABELS.addExpense}
          description={
            spaceKind === "personal"
              ? "ثبت در دفتر مالی من"
              : "خرج جدید را در کمتر از یک دقیقه ثبت کنید."
          }
          delayClass="delay1"
          onClick={() =>
            router.push(spaceKind === "personal" ? spaceHref : expensesHref)
          }
          icon={<ShellIconSvg name="receipt" />}
        />
      </div>

      <div className="lowerGrid">
        <PanelList
          title={spaceKind === "org" ? "منتظر اقدام شما" : "کارهای پیشنهادی"}
          badge={
            spaceKind === "org"
              ? Math.max(data?.recentNeeds.length ?? 0, data?.needCount ?? 0)
              : data?.postedCount ?? 0
          }
          delayClass="delay3"
          footer={
            <button
              className="textButton"
              type="button"
              onClick={() =>
                router.push(
                  spaceKind === "org"
                    ? procurementHref
                    : spaceKind === "personal"
                      ? spaceHref
                      : ledgerHref,
                )
              }
            >
              {spaceKind === "org"
                ? "مشاهده تدارکات ←"
                : spaceKind === "personal"
                  ? "دفتر من ←"
                  : "دفتر روزانه ←"}
            </button>
          }
        >
          {spaceKind === "org" ? (
            (data?.recentNeeds.length ?? 0) === 0 ? (
              <article className="task">
                <div>
                  <b>نیازی در صف نیست</b>
                  <p>از مسیر خرید یک نیاز ثبت کنید</p>
                  <small>آماده ثبت</small>
                </div>
                <strong>
                  —
                  <i>تومان</i>
                </strong>
              </article>
            ) : (
              data!.recentNeeds.map((item) => (
                <article className="task" key={item.id}>
                  <div>
                    <b>{item.title}</b>
                    <p>{data?.workspaceName}</p>
                    <small>{item.status}</small>
                  </div>
                  <strong>
                    خرید
                    <i>نیاز</i>
                  </strong>
                </article>
              ))
            )
          ) : (
            <article className="task">
              <div>
                <b>
                  {spaceKind === "personal"
                    ? "ثبت خرج یا بودجه شخصی"
                    : "ثبت در دفتر روزانه یا تسویه"}
                </b>
                <p>{data?.workspaceName ?? "فضای فعال"}</p>
                <small>
                  {data
                    ? `${data.postedCount} خرج ثبت‌شده · ${data.notificationCount} اعلان`
                    : "—"}
                </small>
              </div>
              <strong>
                {spaceKind === "personal" ? "من" : "گروه"}
                <i>اقدام</i>
              </strong>
            </article>
          )}
        </PanelList>

        <section className="panel card animated delay4">
          <div className="panelHeader">
            <b>فعالیت‌های اخیر</b>
            <span>زنده</span>
          </div>
          <div className="timeline">
            {(data?.recentExpenses.length ?? 0) === 0 && (data?.recentNeeds.length ?? 0) === 0 ? (
              <div className="event">
                <span>·</span>
                <div>
                  <b>هنوز رویدادی نیست</b>
                  <small>دادهٔ نمونه را بسازید تا جریان زنده دیده شود</small>
                </div>
              </div>
            ) : (
              <>
                {data?.recentExpenses.map((item) => (
                  <div className="event" key={item.id}>
                    <span>✓</span>
                    <div>
                      <b>{item.title}</b>
                      <small>
                        {item.status} · {formatToman(item.toman)}
                      </small>
                    </div>
                  </div>
                ))}
                {data?.recentNeeds.map((item) => (
                  <div className="event" key={`need-${item.id}`}>
                    <span>+</span>
                    <div>
                      <b>{item.title}</b>
                      <small>نیاز خرید · {item.status}</small>
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
          <button className="textButton" type="button" onClick={() => router.push(settlementsHref)}>
            مشاهده همه فعالیت‌ها ←
          </button>
        </section>
      </div>
    </AppShell>
  );
}
