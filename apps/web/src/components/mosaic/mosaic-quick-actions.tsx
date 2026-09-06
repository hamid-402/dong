"use client";

import Link from "next/link";
import { ShellIconSvg } from "@/components/app-shell";
import { hubPathFor } from "@/lib/hub-links";
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

const PERSONAL: KindActions = {
  primary: {
    key: "expense",
    href: `${hubPathFor("/me")}#personal-expense`,
    label: "ثبت خرج خصوصی",
    description: "کار بعدی شما",
    icon: "receipt",
  },
  secondary: [
    {
      key: "me",
      href: hubPathFor("/me"),
      label: "دفتر من",
      description: "حساب و منابع شخصی",
      icon: "wallet",
    },
    {
      key: "spaces",
      href: hubPathFor("/group"),
      label: "گروه‌ها",
      description: "رفتن به فضای گروهی",
      icon: "partners",
    },
  ],
};

const GROUP: KindActions = {
  primary: {
    key: "expense",
    href: `${hubPathFor("/group")}#quick-expense`,
    label: "ثبت خرج گروه",
    description: "مادرخرج: پرداخت شما، سهم اعضا",
    icon: "receipt",
  },
  secondary: [
    {
      key: "group",
      href: hubPathFor("/group"),
      label: "خانه گروه",
      description: "اعضا، مانده و لیست",
      icon: "partners",
    },
    {
      key: "settle",
      href: `${hubPathFor("/workspaces")}#settlement-panel`,
      label: "تسویه و تأیید",
      description: "اعضا سهم را بپردازند",
      icon: "wallet",
    },
    {
      key: "daily",
      href: hubPathFor("/daily-ledger"),
      label: "دفتر روزانه",
      description: "مصرف روز×عضو",
      icon: "receipt",
    },
  ],
};

const ORG: KindActions = {
  primary: {
    key: "finance",
    href: hubPathFor("/workspaces"),
    label: "ثبت یا تأیید خرج",
    description: "کار بعدی شما",
    icon: "wallet",
  },
  secondary: [
    {
      key: "orgs",
      href: hubPathFor("/orgs"),
      label: "خانه سازمان",
      description: "بودجه و مطالبات",
      icon: "box",
    },
    {
      key: "buy",
      href: hubPathFor("/workspaces/procurement"),
      label: "تدارکات",
      description: "نیاز و خرید",
      icon: "cart",
    },
    {
      key: "daily",
      href: hubPathFor("/daily-ledger"),
      label: "دفتر روزانه",
      description: "مصرف روزانه تیم",
      icon: "receipt",
    },
  ],
};

const FALLBACK: KindActions = {
  primary: PERSONAL.primary,
  secondary: [GROUP.secondary[0]!, ORG.secondary[1]!],
};

function actionsForKind(kind: "personal" | "group" | "org" | undefined): KindActions {
  if (kind === "personal") return PERSONAL;
  if (kind === "group") return GROUP;
  if (kind === "org") return ORG;
  return FALLBACK;
}

/** One primary CTA + secondary links — nothing removed, hierarchy clarified. */
export function MosaicQuickActions() {
  const chrome = useAppChrome();
  const ws = chrome.workspaces.find((w) => w.id === chrome.workspaceId);
  const kind = spaceKindForTemplate(ws?.template);
  const { primary, secondary } = actionsForKind(kind);

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
