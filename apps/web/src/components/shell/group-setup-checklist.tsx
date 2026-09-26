"use client";

import Link from "next/link";
import { wPath } from "@/lib/workspace-paths";

type SetupStep = {
  key: string;
  label: string;
  hint: string;
  href: string;
  done: boolean;
  ctaLabel: string;
};

/**
 * Honest bootstrap checklist for group spaces — only real counts from dashboard/members.
 * Hidden once every step is complete. CTAs respect membership capability (no 403 tease).
 */
export function GroupSetupChecklist({
  slug,
  memberCount,
  financeManagerCount,
  postedCount,
  canManageMembers,
  canAddExpense = true,
}: {
  slug: string;
  memberCount: number;
  /** Active owner/admin/finance count from membership list. */
  financeManagerCount: number;
  postedCount: number;
  canManageMembers: boolean;
  /** Guest/auditor/approver cannot post — expense step is view-only. */
  canAddExpense?: boolean;
}) {
  const membersListHref = wPath(slug, "members");
  const expensesViewHref = wPath(slug, "expenses");

  const steps: SetupStep[] = [
    {
      key: "finance-quorum",
      label: "مادرخرج",
      hint:
        financeManagerCount >= 1
          ? `${financeManagerCount.toLocaleString("fa-IR")} مدیر مالی فعال`
          : canManageMembers
            ? "حداقل یک مالک/ادمین/مادرخرج لازم است تا عضو عادی اضافه شود"
            : "منتظر تعیین مادرخرج توسط مدیر فضا",
      href: canManageMembers
        ? `${membersListHref}#member-add-panel`
        : membersListHref,
      done: financeManagerCount >= 1,
      ctaLabel: canManageMembers ? "انجام ←" : "مشاهده",
    },
    {
      key: "members",
      label: "اعضای گروه",
      hint:
        memberCount >= 2
          ? `${memberCount.toLocaleString("fa-IR")} عضو`
          : canManageMembers
            ? "نفر دوم را با نام‌کاربری اضافه کنید"
            : "منتظر دعوت از مدیر فضا",
      href: canManageMembers
        ? `${membersListHref}#member-add-panel`
        : membersListHref,
      done: memberCount >= 2,
      ctaLabel: canManageMembers ? "انجام ←" : "مشاهده",
    },
    {
      key: "expense",
      label: "اولین خرج",
      hint:
        postedCount > 0
          ? `${postedCount.toLocaleString("fa-IR")} خرج ثبت‌شده`
          : canAddExpense
            ? "یک خرج مشترک ثبت کنید تا مانده زنده شود"
            : "وقتی خرجی ثبت شود مانده اینجا زنده می‌شود",
      href: canAddExpense
        ? `${expensesViewHref}#expense-panel`
        : expensesViewHref,
      done: postedCount > 0,
      ctaLabel: canAddExpense ? "انجام ←" : "مشاهده",
    },
  ];

  const pending = steps.filter((s) => !s.done);
  if (pending.length === 0) return null;

  const doneCount = steps.length - pending.length;

  return (
    <section className="groupSetupChecklist" aria-label="راه‌اندازی گروه">
      <header className="groupSetupChecklist__head">
        <h2 className="groupSetupChecklist__title">راه‌اندازی گروه</h2>
        <p className="groupSetupChecklist__lead">
          {doneCount.toLocaleString("fa-IR")} از {steps.length.toLocaleString("fa-IR")} مرحله
          انجام شده — بقیه را از همین‌جا باز کنید.
        </p>
      </header>
      <ol className="groupSetupChecklist__list">
        {steps.map((step) => (
          <li
            key={step.key}
            className={
              step.done
                ? "groupSetupChecklist__item groupSetupChecklist__item--done"
                : "groupSetupChecklist__item"
            }
          >
            <span className="groupSetupChecklist__mark" aria-hidden>
              {step.done ? "✓" : "○"}
            </span>
            <div className="groupSetupChecklist__body">
              <strong>{step.label}</strong>
              <small>{step.hint}</small>
            </div>
            {!step.done ? (
              <Link href={step.href} className="groupSetupChecklist__cta">
                {step.ctaLabel}
              </Link>
            ) : (
              <span className="groupSetupChecklist__ok">انجام شد</span>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}
