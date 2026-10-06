/**
 * Kind-aware treasury / finance-role copy.
 * Same role duties; labels differ by space kind (friends vs org/building).
 * Personal spaces have no shared petty cash — use savings goals instead.
 */

export type TreasurySpaceKind = "personal" | "group" | "building" | "org";

export type TreasuryLabels = {
  /** Role: مادرخرج / مدیر مالی */
  financeRole: string;
  /** Short role for badges */
  financeRoleShort: string;
  /** Shared cash box name */
  pettyCash: string;
  /** Custodian of the fund */
  custodian: string;
  /** Deputy / assistant label */
  deputy: string;
  /** Default fund name when ensuring one box */
  defaultFundName: string;
  /** Empty-state CTA */
  ensureFundCta: string;
  /** Balance card title */
  balanceTitle: string;
};

export function treasuryLabelsForKind(kind: TreasurySpaceKind): TreasuryLabels {
  if (kind === "org") {
    return {
      financeRole: "مدیر مالی",
      financeRoleShort: "مالی",
      pettyCash: "تنخواه سازمانی",
      custodian: "نگهبان تنخواه",
      deputy: "معاون مالی",
      defaultFundName: "تنخواه اصلی سازمان",
      ensureFundCta: "ایجاد تنخواه اصلی",
      balanceTitle: "مانده تنخواه",
    };
  }
  if (kind === "building") {
    return {
      financeRole: "مدیر مالی ساختمان",
      financeRoleShort: "مالی",
      pettyCash: "تنخواه ساختمان",
      custodian: "نگهبان تنخواه",
      deputy: "جانشین مالی",
      defaultFundName: "تنخواه اصلی ساختمان",
      ensureFundCta: "ایجاد تنخواه اصلی",
      balanceTitle: "مانده تنخواه",
    };
  }
  if (kind === "personal") {
    return {
      financeRole: "خودتان",
      financeRoleShort: "شخصی",
      pettyCash: "—",
      custodian: "—",
      deputy: "—",
      defaultFundName: "—",
      ensureFundCta: "—",
      balanceTitle: "پس‌انداز شخصی",
    };
  }
  return {
    financeRole: "مادرخرج",
    financeRoleShort: "مادرخرج",
    pettyCash: "تنخواه گروه",
    custodian: "نگهبان صندوق",
    deputy: "جانشین مادرخرج",
    defaultFundName: "تنخواه اصلی گروه",
    ensureFundCta: "ایجاد تنخواه اصلی",
    balanceTitle: "مانده تنخواه",
  };
}

/** Personal spaces never use shared petty cash. */
export function pettyCashAllowedForKind(kind: TreasurySpaceKind): boolean {
  return kind !== "personal";
}
