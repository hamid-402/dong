/**
 * Deep-link from a building/org subunit into the expense form with a prefilled title.
 */
export function expenseHrefForUnit(
  expensesHref: string,
  code: string,
  name?: string,
): string {
  const params = new URLSearchParams();
  params.set("unit", code.trim());
  const n = name?.trim();
  if (n) params.set("unitName", n);
  const base = expensesHref.split("#")[0] ?? expensesHref;
  const sep = base.includes("?") ? "&" : "?";
  return `${base}${sep}${params.toString()}#expense-panel`;
}

export function readUnitPrefillFromUrl(): { code: string; name: string } | null {
  if (typeof window === "undefined") return null;
  const sp = new URLSearchParams(window.location.search);
  const code = sp.get("unit")?.trim() ?? "";
  if (!code) return null;
  return { code, name: sp.get("unitName")?.trim() ?? "" };
}

export function titleForUnitPrefill(unit: { code: string; name: string }): string {
  return unit.name
    ? `شارژ ${unit.name} (${unit.code})`
    : `شارژ واحد ${unit.code}`;
}
