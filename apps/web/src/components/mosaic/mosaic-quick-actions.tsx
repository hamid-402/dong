"use client";

import Link from "next/link";
import { ShellIconSvg } from "@/components/app-shell";
import { hubPathFor } from "@/lib/hub-links";
import { wPath } from "@/lib/workspace-paths";
import { useAppChrome } from "@/lib/use-app-chrome";
import { spaceKindForTemplate } from "@dang/contracts";

type Action = {
  key: string;
  href: string;
  label: string;
  description: string;
  icon: "wallet" | "partners" | "receipt" | "home" | "box" | "cart";
};

type KindActions = { primary: Action; secondary: Action[] };

function scoped(slug: string | null, page: Parameters<typeof wPath>[1], classic: string): string {
  return slug ? wPath(slug, page) : hubPathFor(classic);
}

function actionsForKind(
  kind: "personal" | "group" | "org" | undefined,
  slug: string | null,
): KindActions {
  const personal: KindActions = {
    primary: {
      key: "expense",
      href: `${scoped(slug, "space", "/me")}#personal-expense`,
      label: "ثبت خرج خصوصی",
      description: "کار بعدی شما",
      icon: "receipt",
    },
    secondary: [
      {
        key: "me",
        href: scoped(slug, "space", "/me"),
        label: "دفتر من",
        description: "حساب و منابع شخصی",
        icon: "wallet",
      },
      {
        key: "spaces",
        href: slug ? "/spaces" : hubPathFor("/group"),
        label: "گروه‌ها",
        description: "رفتن به فضای گروهی",
        icon: "partners",
      },
    ],
  };

  const group: KindActions = {
    primary: {
      key: "expense",
      href: `${scoped(slug, "expenses", "/group")}#quick-expense`,
      label: "ثبت خرج گروه",
      description: "مادرخرج: پرداخت شما، سهم اعضا",
      icon: "receipt",
    },
    secondary: [
      {
        key: "group",
        href: scoped(slug, "space", "/group"),
        label: "خانه گروه",
        description: "اعضا، مانده و لیست",
        icon: "partners",
      },
      {
        key: "settle",
        href: slug
          ? wPath(slug, "settlements")
          : `${hubPathFor("/workspaces")}#settlement-panel`,
        label: "تسویه و تأیید",
        description: "اعضا سهم را بپردازند",
        icon: "wallet",
      },
      {
        key: "daily",
        href: scoped(slug, "ledger", "/daily-ledger"),
        label: "دفتر روزانه",
        description: "مصرف روز×عضو",
        icon: "receipt",
      },
    ],
  };

  const org: KindActions = {
    primary: {
      key: "finance",
      href: scoped(slug, "expenses", "/workspaces"),
      label: "ثبت یا تأیید خرج",
      description: "کار بعدی شما",
      icon: "wallet",
    },
    secondary: [
      {
        key: "orgs",
        href: scoped(slug, "space", "/orgs"),
        label: "خانه سازمان",
        description: "بودجه و مطالبات",
        icon: "box",
      },
      {
        key: "buy",
        href: scoped(slug, "procurement", "/workspaces/procurement"),
        label: "تدارکات",
        description: "نیاز و خرید",
        icon: "cart",
      },
      {
        key: "daily",
        href: scoped(slug, "ledger", "/daily-ledger"),
        label: "دفتر روزانه",
        description: "مصرف روزانه تیم",
        icon: "receipt",
      },
    ],
  };

  if (kind === "personal") return personal;
  if (kind === "group") return group;
  if (kind === "org") return org;
  return {
    primary: personal.primary,
    secondary: [group.secondary[0]!, org.secondary[1]!],
  };
}

/** One primary CTA + secondary links — nothing removed, hierarchy clarified. */
export function MosaicQuickActions() {
  const chrome = useAppChrome();
  const ws = chrome.workspaces.find((w) => w.id === chrome.workspaceId);
  const slug = ws?.slug ?? null;
  const kind = spaceKindForTemplate(ws?.template);
  const { primary, secondary } = actionsForKind(kind, slug);

  return (
    <div className="mosaic-quick mosaic-quick--lean">
      <Link href={primary.href} className="mosaic-quick__primary">
        <span className="mosaic-quick__icon" aria-hidden>
          <ShellIconSvg name={primary.icon} />
        </span>
        <span className="mosaic-quick__copy">
          <span className="mosaic-quick__eyebrow">{primary.description}</span>
          <span className="mosaic-quick__label">{primary.label}</span>
        </span>
        <span className="mosaic-quick__chev" aria-hidden>
          ‹
        </span>
      </Link>
      <nav className="mosaic-quick__secondary" aria-label="میانبرهای دیگر">
        {secondary.map((action) => (
          <Link key={action.key} href={action.href} className="mosaic-quick__chip">
            <ShellIconSvg name={action.icon} />
            <span>{action.label}</span>
          </Link>
        ))}
      </nav>
    </div>
  );
}
