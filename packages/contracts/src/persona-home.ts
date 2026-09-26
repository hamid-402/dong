/**
 * Role × spaceKind home chrome — what each persona sees on
 * `/w/[slug]/space` for group / building / org (not personal).
 */

import {
  resolveUiPersona,
  type UiPersona,
} from "./role-surface.js";

/** Local alias — avoid circular import with index.ts. */
type SpaceKind = "personal" | "group" | "building" | "org";

export type PersonaHomeActionKind =
  | "expense"
  | "expenses"
  | "settlements"
  | "members"
  | "invite"
  | "addMember"
  | "approvals"
  | "statements"
  | "procurement"
  | "assets"
  | "subunits"
  | "partners"
  | "settings"
  | "overview"
  | "orgFinance"
  | "ledger"
  | "invoices";

export type PersonaHomeFlags = {
  approvalQueue?: boolean;
  orgFinanceLive?: boolean;
  statementsLive?: boolean;
  /** Template has procurement / construction buy path. */
  procurement?: boolean;
  partners?: boolean;
};

export type PersonaHomePanels = {
  balanceHero: boolean;
  setupChecklist: boolean;
  frequentActions: boolean;
  relatedLinks: boolean;
  outingComposer: boolean;
  approvalsCard: boolean;
  budgetsCard: boolean;
  claimsCard: boolean;
  companyExpenses: boolean;
  subunits: boolean;
  opsRail: boolean;
};

export type PersonaHomeSpec = {
  persona: UiPersona;
  titleFa: string;
  blurbFa: string;
  primary: PersonaHomeActionKind;
  secondary: PersonaHomeActionKind[];
  panels: PersonaHomePanels;
  canAddExpense: boolean;
  showInviteLink: boolean;
  showAddMember: boolean;
  showMutateCompany: boolean;
  relatedLinkKinds: PersonaHomeActionKind[];
};

const KIND_TITLE: Record<Exclude<SpaceKind, "personal">, string> = {
  group: "خلاصهٔ گروه",
  building: "خانه ساختمان",
  org: "خانه سازمان",
};

function titleFor(kind: SpaceKind, persona: UiPersona): string {
  if (kind === "personal") return "فضای شخصی";
  const base = KIND_TITLE[kind];
  switch (persona) {
    case "finance":
      return kind === "group" ? "هاب مادرخرج" : `${base} · مادرخرج`;
    case "approver":
      return `${base} · تأیید`;
    case "buyer":
      return `${base} · خرید`;
    case "guest":
      return `${base} · مهمان`;
    case "auditor":
      return `${base} · ناظر`;
    case "owner":
      return kind === "group" ? "خانهٔ مالک گروه" : `${base} · مالک`;
    default:
      return base;
  }
}

function blurbFor(
  persona: UiPersona,
  kind: SpaceKind,
): string {
  const place =
    kind === "org" ? "سازمان" : kind === "building" ? "ساختمان" : "گروه";
  switch (persona) {
    case "owner":
      return `خانهٔ مالک ${place}: مانده · دعوت · تأییدهای باز · چرخهٔ عمر`;
    case "finance":
      return `هاب مادرخرج ${place}: مانده · تأیید · صورتحساب · یادآوری بدهی`;
    case "member":
      return `خرج · مانده · تسویه · اعضا — مسیر سادهٔ عضو در ${place}`;
    case "guest":
      return `دسترسی مهمان — مشاهدهٔ محدود و ترک ${place}`;
    case "auditor":
      return `ناظر گزارش‌خوان ${place} — audit، متریک و مشاهده بدون mutate`;
    case "approver":
      return `صف تأیید و پیش‌نویس‌های منتظر در ${place}`;
    case "buyer":
      return `راه‌آهن خرید و اموال ${place}`;
  }
}

/**
 * Product home chrome for a membership role inside a non-personal space.
 * Empty role → null (caller keeps discoverable defaults until membership loads).
 */
export function personaHomeSpec(
  role: string | null | undefined,
  spaceKind: SpaceKind,
  flags: PersonaHomeFlags = {},
): PersonaHomeSpec | null {
  const persona = resolveUiPersona(role);
  if (!persona || spaceKind === "personal") return null;

  const approval = Boolean(flags.approvalQueue);
  const buy = Boolean(flags.procurement);
  const statements = Boolean(flags.statementsLive);
  const orgFin = Boolean(flags.orgFinanceLive);
  const partners = Boolean(flags.partners);

  const basePanels: PersonaHomePanels = {
    balanceHero: true,
    setupChecklist: false,
    frequentActions: true,
    relatedLinks: true,
    outingComposer: spaceKind === "group",
    approvalsCard: false,
    budgetsCard: false,
    claimsCard: false,
    companyExpenses: false,
    subunits: spaceKind === "org" || spaceKind === "building",
    opsRail: spaceKind === "org" || spaceKind === "building",
  };

  const titleFa = titleFor(spaceKind, persona);
  const blurbFa = blurbFor(persona, spaceKind);

  if (persona === "guest") {
    return {
      persona,
      titleFa,
      blurbFa,
      primary: "expenses",
      secondary: ["settlements", "members", "settings"],
      panels: {
        ...basePanels,
        balanceHero: true,
        setupChecklist: false,
        frequentActions: true,
        relatedLinks: false,
        outingComposer: false,
        approvalsCard: false,
        budgetsCard: false,
        claimsCard: false,
        companyExpenses: false,
        subunits: false,
        opsRail: false,
      },
      canAddExpense: false,
      showInviteLink: false,
      showAddMember: false,
      showMutateCompany: false,
      relatedLinkKinds: ["expenses", "settlements", "members", "settings"],
    };
  }

  if (persona === "auditor") {
    return {
      persona,
      titleFa,
      blurbFa,
      primary: statements ? "statements" : "ledger",
      secondary: ["expenses", "settlements", "members"],
      panels: {
        ...basePanels,
        setupChecklist: false,
        outingComposer: false,
        approvalsCard: false,
        budgetsCard: spaceKind === "org",
        claimsCard: false,
        companyExpenses: false,
        subunits: spaceKind !== "group",
        opsRail: false,
      },
      canAddExpense: false,
      showInviteLink: false,
      showAddMember: false,
      showMutateCompany: false,
      relatedLinkKinds: [
        "expenses",
        "settlements",
        "ledger",
        ...(statements ? (["statements"] as const) : []),
        "members",
      ],
    };
  }

  if (persona === "approver") {
    return {
      persona,
      titleFa,
      blurbFa,
      primary: approval ? "approvals" : "expenses",
      secondary: ["expenses", "settlements", "members"],
      panels: {
        ...basePanels,
        setupChecklist: false,
        outingComposer: false,
        approvalsCard: approval,
        budgetsCard: false,
        claimsCard: spaceKind === "org",
        companyExpenses: false,
        subunits: false,
        opsRail: false,
      },
      canAddExpense: false,
      showInviteLink: false,
      showAddMember: false,
      showMutateCompany: false,
      relatedLinkKinds: [
        ...(approval ? (["approvals"] as const) : []),
        "expenses",
        "settlements",
        "members",
      ],
    };
  }

  if (persona === "buyer") {
    return {
      persona,
      titleFa,
      blurbFa,
      primary: buy ? "procurement" : "expenses",
      secondary: buy
        ? ["assets", "expenses", "members"]
        : ["expenses", "settlements", "members"],
      panels: {
        ...basePanels,
        setupChecklist: false,
        outingComposer: false,
        approvalsCard: false,
        budgetsCard: spaceKind === "org" && buy,
        claimsCard: false,
        companyExpenses: false,
        subunits: spaceKind !== "group",
        opsRail: spaceKind !== "group",
      },
      canAddExpense: true,
      showInviteLink: false,
      showAddMember: false,
      showMutateCompany: false,
      relatedLinkKinds: [
        ...(buy ? (["procurement", "assets"] as const) : []),
        "expenses",
        "members",
        ...(partners ? (["partners"] as const) : []),
      ],
    };
  }

  if (persona === "member") {
    return {
      persona,
      titleFa,
      blurbFa,
      primary: "expense",
      secondary: ["settlements", "members", "expenses"],
      panels: {
        ...basePanels,
        setupChecklist: false,
        outingComposer: spaceKind === "group",
        approvalsCard: false,
        budgetsCard: false,
        claimsCard: false,
        companyExpenses: false,
        subunits: false,
        opsRail: false,
      },
      canAddExpense: true,
      showInviteLink: false,
      showAddMember: false,
      showMutateCompany: false,
      relatedLinkKinds: [
        "expenses",
        "settlements",
        "members",
        ...(statements ? (["statements"] as const) : []),
        "settings",
      ],
    };
  }

  if (persona === "finance") {
    return {
      persona,
      titleFa,
      blurbFa,
      primary: approval ? "approvals" : "expenses",
      secondary: [
        "statements",
        "addMember",
        "settlements",
        ...(spaceKind !== "group" ? (["subunits"] as const) : []),
      ],
      panels: {
        ...basePanels,
        setupChecklist: true,
        outingComposer: spaceKind === "group",
        approvalsCard: approval,
        budgetsCard: spaceKind === "org",
        claimsCard: spaceKind === "org",
        companyExpenses: spaceKind === "org",
        subunits: spaceKind !== "group",
        opsRail: spaceKind !== "group",
      },
      canAddExpense: true,
      showInviteLink: false,
      showAddMember: true,
      showMutateCompany: true,
      relatedLinkKinds: [
        "expenses",
        "settlements",
        "ledger",
        "invoices",
        ...(statements ? (["statements"] as const) : []),
        "addMember",
        ...(approval ? (["approvals"] as const) : []),
        ...(orgFin ? (["orgFinance"] as const) : []),
        ...(buy ? (["procurement"] as const) : []),
        "members",
      ],
    };
  }

  // owner (and admin via resolveUiPersona)
  return {
    persona,
    titleFa,
    blurbFa,
    primary: "invite",
    secondary: [
      "expense",
      ...(approval ? (["approvals"] as const) : []),
      "members",
      "settings",
    ],
    panels: {
      ...basePanels,
      setupChecklist: true,
      outingComposer: spaceKind === "group",
      approvalsCard: approval,
      budgetsCard: spaceKind === "org",
      claimsCard: spaceKind === "org",
      companyExpenses: spaceKind === "org",
      subunits: spaceKind !== "group",
      opsRail: spaceKind !== "group",
    },
    canAddExpense: true,
    showInviteLink: true,
    showAddMember: true,
    showMutateCompany: true,
    relatedLinkKinds: [
      "expenses",
      "settlements",
      "ledger",
      "members",
      "invite",
      ...(approval ? (["approvals"] as const) : []),
      ...(statements ? (["statements"] as const) : []),
      ...(orgFin ? (["orgFinance"] as const) : []),
      ...(buy ? (["procurement"] as const) : []),
      ...(partners ? (["partners"] as const) : []),
      "settings",
    ],
  };
}

export function personaHomeActionLabelFa(
  kind: PersonaHomeActionKind,
  spaceKind: SpaceKind = "group",
): string {
  switch (kind) {
    case "expense":
      return "ثبت خرج";
    case "expenses":
      return spaceKind === "building" ? "شارژ و قبوض" : "خرج‌ها";
    case "settlements":
      return "تسویه";
    case "members":
      return "اعضا";
    case "invite":
      return "ساخت دعوت";
    case "addMember":
      return "افزودن عضو";
    case "approvals":
      return "مرکز تأیید";
    case "statements":
      return "صورتحساب";
    case "procurement":
      return "تدارکات";
    case "assets":
      return "اموال";
    case "subunits":
      return spaceKind === "building" ? "واحدها" : "بخش‌ها";
    case "partners":
      return "شرکا";
    case "settings":
      return "تنظیمات / ترک";
    case "overview":
      return "مرکز فضا";
    case "orgFinance":
      return "مالی سازمان";
    case "ledger":
      return "دفتر روزانه";
    case "invoices":
      return "صورتحساب دوره";
  }
}

/* ─── Settings severity (Phase C) ─── */

export type PersonaSettingsJump =
  | "settings-profile"
  | "settings-members"
  | "payout"
  | "danger";

export type PersonaSettingsSpec = {
  persona: UiPersona;
  leadFa: string;
  /** Owner/admin may edit name/timezone/display unit. */
  canEditProfile: boolean;
  /** Owner/admin payout instructions (not finance — plan: finance cannot payout). */
  showPayoutSection: boolean;
  showMembersCard: boolean;
  showPolicyLink: boolean;
  showSubunitsLink: boolean;
  showStatementsLink: boolean;
  showAuditLink: boolean;
  /** Emphasize invite vs add-member in members card. */
  membersCardMode: "invite" | "addMember" | "view" | "leave";
  jumpSections: PersonaSettingsJump[];
};

/**
 * Settings page chrome — severity ladder for owner / finance / member / guest.
 */
export function personaSettingsSpec(
  role: string | null | undefined,
  spaceKind: SpaceKind,
  flags: { expensePolicy?: boolean; payoutLive?: boolean } = {},
): PersonaSettingsSpec | null {
  const persona = resolveUiPersona(role);
  if (!persona) return null;

  const orgish = spaceKind === "org" || spaceKind === "building";
  const showPolicy =
    orgish || Boolean(flags.expensePolicy);
  const payoutLive = Boolean(flags.payoutLive);

  if (persona === "guest" || persona === "auditor") {
    return {
      persona,
      leadFa:
        persona === "auditor"
          ? "ناظر: مشاهدهٔ مشخصات و ترک فضا — بدون ویرایش و بدون payout."
          : "مهمان: مشخصات فقط‌خواندنی و ترک عضویت از منطقهٔ خطر.",
      canEditProfile: false,
      showPayoutSection: false,
      showMembersCard: true,
      showPolicyLink: false,
      showSubunitsLink: false,
      showStatementsLink: persona === "auditor",
      showAuditLink: persona === "auditor",
      membersCardMode: "leave",
      jumpSections: ["settings-profile", "settings-members", "danger"],
    };
  }

  if (persona === "approver" || persona === "buyer") {
    return {
      persona,
      leadFa:
        persona === "approver"
          ? "تأییدکننده: مشاهدهٔ تنظیمات و ترک — مدیریت payout و پروفایل برای مالک است."
          : "خریدار: مشاهدهٔ تنظیمات و ترک — تدارکات از خانهٔ فضا، نه از اینجا.",
      canEditProfile: false,
      showPayoutSection: false,
      showMembersCard: true,
      showPolicyLink: showPolicy,
      showSubunitsLink: orgish,
      showStatementsLink: false,
      showAuditLink: false,
      membersCardMode: "view",
      jumpSections: ["settings-profile", "settings-members", "danger"],
    };
  }

  if (persona === "member") {
    return {
      persona,
      leadFa: "عضو: مشاهدهٔ مشخصات، اعضا و ترک فضا — ویرایش مدیریتی برای مالک است.",
      canEditProfile: false,
      showPayoutSection: false,
      showMembersCard: true,
      showPolicyLink: false,
      showSubunitsLink: orgish,
      showStatementsLink: true,
      showAuditLink: false,
      membersCardMode: "leave",
      jumpSections: ["settings-profile", "settings-members", "danger"],
    };
  }

  if (persona === "finance") {
    return {
      persona,
      leadFa:
        "مادرخرج: اعضا با شناسه، صورتحساب و قوانین مالی — لینک دعوت و payout فقط برای مالک/ادمین.",
      canEditProfile: false,
      showPayoutSection: false,
      showMembersCard: true,
      showPolicyLink: showPolicy,
      showSubunitsLink: orgish,
      showStatementsLink: true,
      showAuditLink: true,
      membersCardMode: "addMember",
      jumpSections: ["settings-profile", "settings-members", "danger"],
    };
  }

  // owner (+ admin via resolveUiPersona)
  const isAdminLabel = role === "admin";
  return {
    persona,
    leadFa: isAdminLabel
      ? "ادمین: مشخصات و دعوت مانند مالک — بایگانی/حذف سخت در منطقهٔ خطر فقط برای مالک است."
      : "مالک: کنترل کامل مشخصات، دعوت، payout و چرخهٔ عمر فضا.",
    canEditProfile: true,
    showPayoutSection: payoutLive,
    showMembersCard: true,
    showPolicyLink: showPolicy,
    showSubunitsLink: orgish,
    showStatementsLink: true,
    showAuditLink: true,
    membersCardMode: "invite",
    jumpSections: payoutLive
      ? ["settings-profile", "settings-members", "payout", "danger"]
      : ["settings-profile", "settings-members", "danger"],
  };
}
