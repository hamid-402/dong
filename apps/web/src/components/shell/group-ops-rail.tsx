"use client";

import Link from "next/link";
import type { SpaceKind } from "@dang/contracts";
import { type ShellIcon } from "@/components/shell/shell-icons";
import { StickerSvg, type StickerName } from "@/components/visual/stickers";
import { KindMoodBadge } from "@/components/visual/kind-mood-badge";
import { NAV_LABELS, spaceTabLabel } from "@/lib/nav-labels";
import { gemCssVars, ROUTE_GEM } from "@/lib/tile-gem-palettes";
import { wPath } from "@/lib/workspace-paths";

type OpsItem = {
  key: string;
  href: string;
  label: string;
  hint: string;
  icon: ShellIcon;
  gemKey: string;
  primary?: boolean;
};

function stickerForOpsItem(key: string, icon: ShellIcon): StickerName {
  switch (key) {
    case "expenses":
    case "personal-finance":
    case "treasury":
      return "coinTilt"; /* X4 */
    case "settlements":
      return "arrows"; /* S2 */
    case "space":
      return "home"; /* B1 */
    case "members":
      return "ring"; /* G4 */
    default:
      break;
  }
  switch (icon) {
    case "partners":
      return "ring";
    case "wallet":
      return "coinTilt";
    case "receipt":
      return "ledger";
    case "home":
      return "home";
    case "box":
      return "folder";
    case "cart":
      return "cart";
    default:
      return "spark";
  }
}

/**
 * Always-visible finance/ops shortcuts — same gem tile language as home mosaic.
 */
export function GroupOpsRail({
  slug,
  spaceKind = "group",
  memberCount,
  openSettlements = 0,
  canManageMembers = false,
  showSubunits = false,
  subunitsHint,
  treasuryBalanceMinor,
  treasuryLabel,
}: {
  slug: string;
  spaceKind?: SpaceKind;
  memberCount?: number;
  openSettlements?: number;
  canManageMembers?: boolean;
  showSubunits?: boolean;
  subunitsHint?: string;
  /** Live IRR minor for petty cash or personal savings — shown in hint when set. */
  treasuryBalanceMinor?: string | null;
  treasuryLabel?: string;
}) {
  const kindLabel = spaceTabLabel(spaceKind);
  const isPersonal = spaceKind === "personal";
  const treasuryHint =
    treasuryBalanceMinor != null
      ? `${treasuryLabel ?? (isPersonal ? "پس‌انداز" : "تنخواه")} · ${(
          Number(treasuryBalanceMinor) / 10
        ).toLocaleString("fa-IR")} تومان`
      : isPersonal
        ? "صندوق پس‌انداز و اهداف"
        : "مانده تنخواه و فیش‌ها";

  const items: OpsItem[] = [];

  if (!isPersonal) {
    items.push({
      key: "members",
      href: canManageMembers
        ? `${wPath(slug, "members")}#member-add-panel`
        : wPath(slug, "members"),
      label: NAV_LABELS.members,
      hint: canManageMembers
        ? memberCount != null
          ? `${memberCount.toLocaleString("fa-IR")} عضو · افزودن و نقش`
          : "افزودن عضو و تغییر نقش"
        : memberCount != null
          ? `${memberCount.toLocaleString("fa-IR")} عضو`
          : "فهرست اعضا و نقش‌ها",
      icon: "partners",
      gemKey: ROUTE_GEM.members ?? "mint",
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
      gemKey: ROUTE_GEM.subunits ?? "olive",
    });
  }

  items.push({
    key: "expenses",
    href: wPath(slug, "expenses"),
    label: NAV_LABELS.expenses,
    hint: "مرکز مدیریت — فهرست، برگشت و اصلاح",
    icon: "wallet",
    gemKey: ROUTE_GEM.expenses ?? "teal",
    primary: true,
  });

  if (isPersonal) {
    items.push({
      key: "personal-finance",
      href: "/me/finance",
      label: NAV_LABELS.personalFinance,
      hint: "بودجه و دفتر شخصی",
      icon: "wallet",
      gemKey: "indigo",
    });
    items.push({
      key: "treasury",
      href: "/me/finance#goals",
      label: treasuryLabel ?? "پس‌انداز",
      hint: treasuryHint,
      icon: "wallet",
      gemKey: "amber",
      primary: true,
    });
  } else {
    items.push({
      key: "ledger",
      href: wPath(slug, "ledger"),
      label: NAV_LABELS.ledger,
      hint: "دفتر روزانه و قلم‌های روز",
      icon: "receipt",
      gemKey: ROUTE_GEM.ledger ?? "cyan",
    });
    items.push({
      key: "treasury",
      href: wPath(slug, "payments"),
      label: treasuryLabel ?? NAV_LABELS.payments,
      hint: treasuryHint,
      icon: "wallet",
      gemKey: ROUTE_GEM.payments ?? "teal",
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
    gemKey: ROUTE_GEM.settlements ?? "amber",
  });

  items.push({
    key: "invoices",
    href: wPath(slug, "invoices"),
    label: NAV_LABELS.invoices,
    hint: "صورتحساب دوره و اختلاف",
    icon: "receipt",
    gemKey: ROUTE_GEM.invoices ?? "blue",
  });

  items.push({
    key: "charts",
    href: wPath(slug, "charts"),
    label: NAV_LABELS.charts,
    hint: "روند خرج، سهم اعضا و ترکیب دسته",
    icon: "receipt",
    gemKey: ROUTE_GEM.charts ?? "sky",
  });

  items.push({
    key: "space",
    href: wPath(slug, "space"),
    label: kindLabel,
    hint: `مانده و نمای کلی ${kindLabel}`,
    icon: "home",
    gemKey: ROUTE_GEM.space ?? "teal",
  });

  return (
    <nav className="groupOpsRail" aria-label={`میان‌برهای مالی ${kindLabel}`}>
      <header className="groupOpsRail__head">
        <div className="groupOpsRail__titleRow">
          <KindMoodBadge kind={spaceKind} size={22} />
          <div>
            <h2 className="groupOpsRail__title">امکانات مالی · {kindLabel}</h2>
            <p className="groupOpsRail__lead">
              ثبت خرج، دفتر، تسویه و صورتحساب — مستقیم، بدون رفتن داخل پوشه‌ها.
            </p>
          </div>
        </div>
      </header>
      <ul className="groupOpsRail__grid">
        {items.map((item) => {
          const stickerName = stickerForOpsItem(item.key, item.icon);
          return (
          <li key={item.key}>
            <Link
              href={item.href}
              className={`dang-gem groupOpsRail__tile${item.primary ? " groupOpsRail__tile--primary" : ""}`}
              style={gemCssVars(item.gemKey)}
            >
              <span className="dang-gem__icon dang-gem__icon--sticker groupOpsRail__icon" aria-hidden>
                <StickerSvg
                  name={stickerName}
                  size={36}
                  animated={false}
                />
              </span>
              <strong>{item.label}</strong>
              <small>{item.hint}</small>
              <span className="groupOpsRail__open" aria-hidden>
                باز کردن ←
              </span>
            </Link>
          </li>
          );
        })}
      </ul>
    </nav>
  );
}
