"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { formatToman } from "@dang/ui";
import { AppShell, ShellIconSvg } from "@/components/app-shell";
import {
  HeroBalance,
  PageHeader,
  PanelList,
  QuickAction,
} from "@/components/ui-blocks";
import { api, getDevIdentity, setDevIdentity } from "@/lib/api";

function useAnimatedBalance(target: number, motionEnabled: boolean) {
  const [mounted, setMounted] = useState(false);
  const [value, setValue] = useState(target);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
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
  }, [mounted, motionEnabled, target]);

  return formatToman(value);
}

function MobileExpensePreview({
  amountLabel,
  payerName,
  title,
  members,
}: {
  amountLabel: string;
  payerName: string;
  title: string;
  members: string[];
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
              href="/workspaces"
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
  workspaceName: string;
  userName: string;
  balanceToman: number;
  expenseCount: number;
  needCount: number;
  notificationCount: number;
  persistence: string;
  recentExpenses: Array<{ id: string; title: string; toman: number; status: string }>;
  recentNeeds: Array<{ id: string; title: string; status: string }>;
  memberNames: string[];
  previewExpenseTitle: string;
  previewExpenseToman: string;
};

export default function Home() {
  const router = useRouter();
  const [motionEnabled, setMotionEnabled] = useState(true);
  const [data, setData] = useState<DashboardState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const balance = useAnimatedBalance(data?.balanceToman ?? 0, motionEnabled);

  function load() {
    startTransition(() => {
      void (async () => {
        try {
          const identity = getDevIdentity();
          setDevIdentity(identity.subject, identity.displayName);
          const [session, caps, workspaces] = await Promise.all([
            api.session(),
            api.capabilities(),
            api.listWorkspaces(),
          ]);
          let list = workspaces;
          if (list.length === 0) {
            await api.seedDemo();
            list = await api.listWorkspaces();
          }
          const workspace = list[0];
          const actor = session.actor;
          if (!workspace || !actor) {
            setError("برای شروع، دادهٔ نمونه را بسازید یا فضای کاری ایجاد کنید.");
            return;
          }
          const [balances, expenses, needs, notifications, members] = await Promise.all([
            api.getBalances(workspace.id),
            api.listExpenses(workspace.id),
            api.listNeeds(workspace.id).catch(() => []),
            api.listNotifications(workspace.id).catch(() => []),
            api.listMembers(workspace.id).catch(() => []),
          ]);
          const myBalance = balances.lines.find((b) => b.userId === actor.userId);
          const netMinor = Number(myBalance?.net.amountMinor ?? "0");
          const firstExpense = expenses[0];
          setData({
            workspaceName: workspace.name,
            userName: actor.displayName,
            balanceToman: Math.round(netMinor / 10),
            expenseCount: expenses.length,
            needCount: needs.length,
            notificationCount: notifications.filter((n) => !n.readAt).length,
            persistence: `${caps.iamPersistence} · ${caps.expensePersistence}`,
            recentExpenses: expenses.slice(0, 3).map((e) => ({
              id: e.id,
              title: e.title,
              toman: Math.round(Number(e.total.amountMinor) / 10),
              status: e.status,
            })),
            recentNeeds: needs.slice(0, 3).map((n) => ({
              id: n.id,
              title: n.title,
              status: n.status,
            })),
            memberNames: members.map((m) => m.displayName).filter(Boolean),
            previewExpenseTitle: firstExpense?.title ?? "خرید اقلام جلسه",
            previewExpenseToman: firstExpense
              ? formatToman(Math.round(Number(firstExpense.total.amountMinor) / 10)).replace(" تومان", "")
              : "۱٬۲۵۰٬۰۰۰",
          });
          setError(null);
        } catch (err: unknown) {
          setError(err instanceof Error ? err.message : "خطای ناشناخته");
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
    load();
  }, []);

  return (
    <AppShell
      workspaceName={data?.workspaceName}
      userName={data?.userName}
      persistenceLabel={data ? `زنده · ${data.persistence}` : "دفتر عملیات مشترک"}
      motionOff={!motionEnabled}
      notificationCount={data?.notificationCount ?? 0}
      rail={
        <MobileExpensePreview
          amountLabel={data?.previewExpenseToman ?? "۱٬۲۵۰٬۰۰۰"}
          payerName={data?.userName ?? "کاربر محلی"}
          title={data?.previewExpenseTitle ?? "خرید اقلام جلسه"}
          members={data?.memberNames ?? []}
        />
      }
    >
      <PageHeader
        eyebrow="نمای کلی همکاری"
        title={`صبح بخیر${data?.userName ? `، ${data.userName.split(" ")[0]}` : ""}`}
        description={
          data
            ? `${data.expenseCount} هزینه · ${data.needCount} نیاز خرید · ${data.notificationCount} اعلان برای بررسی.`
            : "در حال همگام‌سازی با API و Postgres…"
        }
        actions={
          <>
            <time suppressHydrationWarning>{todayLabel || "—"}</time>
            <button type="button" disabled={pending} onClick={load}>
              نوسازی
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                startTransition(() => {
                  void (async () => {
                    try {
                      await api.seedDemo();
                      load();
                    } catch (err: unknown) {
                      setError(err instanceof Error ? err.message : "خطای seed");
                    }
                  })();
                });
              }}
            >
              دادهٔ نمونه
            </button>
            <button type="button" onClick={() => setMotionEnabled((c) => !c)}>
              {motionEnabled ? "توقف حرکت" : "فعال‌کردن حرکت"}
            </button>
          </>
        }
      />

      {error ? <p className="liveError">{error}</p> : null}

      <div className="heroGrid">
        <HeroBalance
          label="مانده خالص شما"
          amount={balance}
          subtitle={(data?.balanceToman ?? 0) >= 0 ? "تومان طلب دارید" : "تومان بدهکارید"}
          actionLabel="مشاهده جزئیات مالی"
          onAction={() => router.push("/workspaces")}
          hint={data ? "متصل به دفترکل" : "…"}
        />
        <QuickAction
          title="ثبت خرج"
          description="هزینه جدید را در کمتر از یک دقیقه ثبت کنید."
          delayClass="delay1"
          onClick={() => router.push("/workspaces")}
          icon={<ShellIconSvg name="receipt" />}
        />
        <QuickAction
          title="درخواست خرید"
          description="یک نیاز جدید برای بررسی و تأیید ارسال کنید."
          delayClass="delay2"
          onClick={() => router.push("/workspaces/procurement")}
          icon={<ShellIconSvg name="cart" />}
        />
      </div>

      <div className="lowerGrid">
        <PanelList
          title="منتظر اقدام شما"
          badge={Math.max(data?.recentNeeds.length ?? 0, data?.needCount ?? 0)}
          delayClass="delay3"
          footer={
            <button className="textButton" type="button" onClick={() => router.push("/workspaces/procurement")}>
              مشاهده همه کارها ←
            </button>
          }
        >
          {(data?.recentNeeds.length ?? 0) === 0 ? (
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
          <button className="textButton" type="button" onClick={() => router.push("/workspaces")}>
            مشاهده همه فعالیت‌ها ←
          </button>
        </section>
      </div>
    </AppShell>
  );
}
