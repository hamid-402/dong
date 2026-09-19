"use client";

import Link from "next/link";
import type { SpaceKind } from "@dang/contracts";
import { ShellIconSvg, type ShellIcon } from "@/components/shell/shell-icons";
import { NAV_LABELS, spaceTabLabel } from "@/lib/nav-labels";
import { wPath } from "@/lib/workspace-paths";

type OpsItem = {
  key: string;
  href: string;
  label: string;
  hint: string;
  icon: ShellIcon;
  primary?: boolean;
};

/**
 * Always-visible finance/ops shortcuts for any space kind.
 * Surfaces ثبت خرج / دفتر / تسویه / صورتحساب without mosaic folder hops.
 */
export function GroupOpsRail({
  slug,
  spaceKind = "group",
  memberCount,
  openSettlements = 0,
  canManageMembers = false,
  showSubunits = false,
  subunitsHint,
}: {
  slug: string;
  spaceKind?: SpaceKind;
  memberCount?: number;
  openSettlements?: number;
  /** Owner / admin / finance — show «افزودن عضو» emphasis. */
  canManageMembers?: boolean;
  /** Building / org — link to units or departments. */
  showSubunits?: boolean;
  subunitsHint?: string;
}) {
  const kindLabel = spaceTabLabel(spaceKind);
  const isPersonal = spaceKind === "personal";

  const items: OpsItem[] = [];

  if (!isPersonal) {
    items.push({
      key: "members",
      href: `${wPath(slug, "members")}#member-add-panel`,
      label: NAV_LABELS.members,
      hint: canManageMembers
        ? memberCount != null
          ? `${memberCount.toLocaleString("fa-IR")} عضو · افزودن و نقش`
          : "افزودن عضو و تغییر نقش"
        : memberCount != null
          ? `${memberCount.toLocaleString("fa-IR")} عضو`
          : "فهرست اعضا و نقش‌ها",
      icon: "partners",
      primary: canManageMembers,
    });
  }

  if (showSubunits && !isPersonal) {
    items.push({
      key: "subunits",
      href: wPath(slug, "subunits"),
      label: NAV_LABELS.subunits,
      hint: subunitsHint ?? "واحدها یا بخش‌ها و افراد هر کدام",
      icon: "box",
    });
  }

  items.push({
    key: "expenses",
    href: wPath(slug, "expenses"),
    label: NAV_LABELS.expenses,
    hint: "ثبت، برگشت و اصلاح خرج",
    icon: "wallet",
    primary: isPersonal,
  });

  if (isPersonal) {
    items.push({
      key: "personal-finance",
      href: "/me/finance",
      label: NAV_LABELS.personalFinance,
      hint: "بودجه و دفتر شخصی",
      icon: "wallet",
    });
  } else {
    items.push({
      key: "ledger",
      href: wPath(slug, "ledger"),
      label: NAV_LABELS.ledger,
      hint: "دفتر روزانه و قلم‌های روز",
      icon: "receipt",
    });
  }

  items.push({
    key: "settlements",
    href: wPath(slug, "settlements"),
    label: NAV_LABELS.settlements,
    hint:
      openSettlements > 0
        ? `${openSettlements.toLocaleString("fa-IR")} تسویه باز`
        : "ادعا و تأیید تسویه",
    icon: "receipt",
  });

  items.push({
    key: "invoices",
    href: wPath(slug, "invoices"),
    label: NAV_LABELS.invoices,
    hint: "صورتحساب دوره و اختلاف",
    icon: "receipt",
  });

  items.push({
    key: "charts",
    href: wPath(slug, "charts"),
    label: NAV_LABELS.charts,
    hint: "روند خرج، سهم اعضا و ترکیب دسته",
    icon: "receipt",
  });

  items.push({
    key: "space",
    href: wPath(slug, "space"),
    label: kindLabel,
    hint: `مانده و نمای کلی ${kindLabel}`,
    icon: "home",
  });

  return (
    <nav className="groupOpsRail" aria-label={`میان‌برهای مالی ${kindLabel}`}>
      <header className="groupOpsRail__head">
        <h2 className="groupOpsRail__title">امکانات مالی · {kindLabel}</h2>
        <p className="groupOpsRail__lead">
          ثبت خرج، دفتر، تسویه و صورتحساب — مستقیم، بدون رفتن داخل پوشه‌ها.
        </p>
      </header>
      <ul className="groupOpsRail__grid">
        {items.map((item) => (
          <li key={item.key}>
            <Link
              href={item.href}
              className={
                item.primary
                  ? "groupOpsRail__tile groupOpsRail__tile--primary"
                  : "groupOpsRail__tile"
              }
            >
              <span className="groupOpsRail__icon" aria-hidden>
                <ShellIconSvg name={item.icon} />
              </span>
              <strong>{item.label}</strong>
              <small>{item.hint}</small>
              <span className="groupOpsRail__open" aria-hidden>
                باز کردن ←
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
