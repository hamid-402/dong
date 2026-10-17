import type { SpaceKind } from "@dang/contracts";
import { NAV_LABELS } from "@/lib/nav-labels";

/** Primary CTA label + preference for href kind. */
export function spaceHomePrimaryCta(
  spaceKind: SpaceKind,
  opts: { buildingChargesLive?: boolean; canProcure?: boolean } = {},
): { label: string; prefer: "record" | "invoices" | "procurement" } {
  if (spaceKind === "building" && opts.buildingChargesLive) {
    return { label: "ثبت شارژ", prefer: "invoices" };
  }
  if (spaceKind === "org" && opts.canProcure) {
    return { label: "درخواست خرید", prefer: "procurement" };
  }
  if (spaceKind === "personal") {
    return { label: "ثبت خرج", prefer: "record" };
  }
  return { label: NAV_LABELS.addExpense || "ثبت خرج", prefer: "record" };
}

export function spaceHomeKeyLabel(spaceKind: SpaceKind, tone: "credit" | "debt" | "settled"): string {
  if (spaceKind === "personal") return "خالص این ماه";
  if (spaceKind === "building") return "بدهی واحدها / صندوق";
  if (spaceKind === "org") return "تأیید و تنخواه";
  if (tone === "credit") return "مانده شما · طلبکار";
  if (tone === "debt") return "مانده شما · بدهکار";
  return "مانده شما";
}
