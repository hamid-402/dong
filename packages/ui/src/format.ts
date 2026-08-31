const tomanFormatter = new Intl.NumberFormat("fa-IR");

/** Display helper: minor IRR units → تومان string. 10 IRR = 1 تومان. */
export function formatTomanFromIrrMinor(amountMinor: string | number): string {
  const irr = typeof amountMinor === "string" ? BigInt(amountMinor) : BigInt(amountMinor);
  const toman = irr / 10n;
  return tomanFormatter.format(toman);
}

export function formatToman(amountToman: number): string {
  return tomanFormatter.format(amountToman);
}
