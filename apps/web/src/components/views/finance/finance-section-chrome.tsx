import Link from "next/link";
import type { ReactNode } from "react";
import type { SpaceKind } from "@dang/contracts";
import { resolveUiPersona } from "@dang/contracts";
import type { FinanceSection } from "@/components/views/finance/use-finance-data";
import { NAV_LABELS } from "@/lib/nav-labels";
import { wPath } from "@/lib/workspace-paths";

export type FinanceSectionChrome = {
  title: string;
  description: string;
  primary: ReactNode;
  secondary?: ReactNode;
};

/**
 * Page chrome for finance sections — role-aware CTAs (no 403 tease).
 */
export function buildFinanceSectionChrome(input: {
  section: FinanceSection;
  spaceKind: SpaceKind | null | undefined;
  slug: string | null;
  expensesHref: string;
  settlementsHref: string;
  membersHref: string;
  canManageFinance: boolean;
  readOnlyFinance: boolean;
  /** Membership role — when set, secondary links avoid add-member deep-links. */
  membershipRole?: string | null;
  canApproveCompany?: boolean;
}): FinanceSectionChrome {
  const {
    section,
    spaceKind,
    slug,
    expensesHref,
    settlementsHref,
    membersHref,
    canManageFinance,
    readOnlyFinance,
    membershipRole,
    canApproveCompany,
  } = input;

  const persona = resolveUiPersona(membershipRole);
  const membersListHref = membersHref.replace(/#.*$/, "");
  const membersHrefSafe =
    canManageFinance && !readOnlyFinance
      ? `${membersListHref}#member-add-panel`
      : membersListHref;
  const approvalsHref = slug ? wPath(slug, "approvals") : null;

  if (section === "settlements") {
    return {
      title: NAV_LABELS.settlements,
      description: readOnlyFinance
        ? "مشاهدهٔ تسویه‌ها — نقش شما اجازهٔ ثبت تسویه ندارد."
        : "ثبت و تأیید تسویه از ماندهٔ واقعی اعضا.",
      primary: <Link href={expensesHref}>{NAV_LABELS.expenses}</Link>,
      secondary: slug ? (
        <>
          <Link href={membersHrefSafe}>{NAV_LABELS.members}</Link>
          <Link href={wPath(slug, "space")}>{NAV_LABELS.spaceGroup}</Link>
        </>
      ) : undefined,
    };
  }

  if (section === "invoices") {
    return {
      title: NAV_LABELS.invoices,
      description:
        "دوره‌ها و صورتحساب دوره‌ای اعضا از دادهٔ ثبت‌شدهٔ همین فضا (جدا از صورتحساب سهم‌محور).",
      primary: canManageFinance && !readOnlyFinance ? (
        <a href="#period-invoice-panel">ساخت دوره</a>
      ) : (
        <Link href={expensesHref}>{NAV_LABELS.expenses}</Link>
      ),
      secondary: slug ? (
        <>
          <Link href={settlementsHref}>{NAV_LABELS.settlements}</Link>
          <Link href={membersHrefSafe}>{NAV_LABELS.members}</Link>
        </>
      ) : undefined,
    };
  }

  if (section === "recurring") {
    return {
      title: NAV_LABELS.recurring,
      description: "گزارش‌های دوره‌ای، دسته‌ها و قواعد تکرارشونده از API.",
      primary: <a href="#reports-panel">محاسبه گزارش</a>,
      secondary: slug ? (
        <>
          <Link href={expensesHref}>{NAV_LABELS.expenses}</Link>
          <Link href={settlementsHref}>{NAV_LABELS.settlements}</Link>
        </>
      ) : undefined,
    };
  }

  const ledgerHref = slug ? wPath(slug, "ledger") : null;
  const expensesDescription = readOnlyFinance
    ? "مشاهدهٔ خرج‌ها — نقش شما فقط‌خواندنی است و ثبت خرج فعال نیست."
    : persona === "approver"
      ? "خرج‌های فضا برای بررسی — اقدام تأیید از مرکز تأیید."
      : spaceKind === "building"
        ? "شارژ و قبوض همین ساختمان — ثبت سریع، فهرست، برگشت و اصلاح. جدول روز×عضو در دفتر روزانه است."
        : spaceKind === "org"
          ? "خرج سازمانی همین فضا — ثبت سریع، فهرست، برگشت و اصلاح."
          : spaceKind === "group"
            ? "خرج‌های این گروه — ثبت و فهرست اینجا؛ جدول روزانه در دفتر روزانه؛ تسویهٔ مانده در تسویه."
            : "خرج‌های همین فضا — ثبت، فهرست، برگشت و اصلاح.";

  return {
    title: NAV_LABELS.expenses,
    description: expensesDescription,
    primary: readOnlyFinance ? (
      <Link href={settlementsHref}>{NAV_LABELS.settlements}</Link>
    ) : persona === "approver" && approvalsHref ? (
      <Link href={approvalsHref}>{NAV_LABELS.approvals}</Link>
    ) : (
      <a href="#expense-panel">{NAV_LABELS.addExpense}</a>
    ),
    secondary: slug ? (
      <>
        <a href="#expense-list">فهرست خرج‌ها</a>
        {ledgerHref && persona !== "guest" ? (
          <Link href={ledgerHref}>{NAV_LABELS.ledger}</Link>
        ) : null}
        <Link href={settlementsHref}>{NAV_LABELS.settlements}</Link>
        {canApproveCompany && approvalsHref && persona !== "member" ? (
          <Link href={approvalsHref}>{NAV_LABELS.approvals}</Link>
        ) : null}
        <Link href={membersHrefSafe}>{NAV_LABELS.members}</Link>
      </>
    ) : (
      <a href="#expense-list">فهرست خرج‌ها</a>
    ),
  };
}
