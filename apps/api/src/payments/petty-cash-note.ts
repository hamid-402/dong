/** Machine-readable tags in petty-cash notes (ASCII-safe across encodings). */
export function parsePettyCashNoteMeta(note?: string): {
  cashInByUserId?: string;
  ledgerDate?: string;
} {
  if (!note) return {};
  const cashInByUserId =
    /(?:cashInBy|واریزکننده)\s*:\s*([a-zA-Z0-9_-]+)/u.exec(note)?.[1]?.trim() ||
    /ÙˆØ§Ø±ÛŒØ²Ú©Ù†Ù†Ø¯Ù‡:\s*([a-zA-Z0-9_-]+)/u.exec(note)?.[1]?.trim();
  const ledgerDate =
    /ledgerDate:(\d{4}-\d{2}-\d{2})/u.exec(note)?.[1] ||
    /(?:دفتر روزانه)\s*[—\-]\s*(\d{4}-\d{2}-\d{2})/u.exec(note)?.[1];
  return {
    ...(cashInByUserId ? { cashInByUserId } : {}),
    ...(ledgerDate ? { ledgerDate } : {}),
  };
}

export function appendPettyCashNoteMeta(
  base: string,
  meta: { cashInByUserId: string; ledgerDate?: string },
): string {
  const parts = [`cashInBy:${meta.cashInByUserId}`];
  if (meta.ledgerDate) parts.push(`ledgerDate:${meta.ledgerDate}`);
  const tag = parts.join(" ");
  if (base.includes(`cashInBy:${meta.cashInByUserId}`)) {
    if (meta.ledgerDate && !base.includes(`ledgerDate:${meta.ledgerDate}`)) {
      return `${base.trim()} (ledgerDate:${meta.ledgerDate})`;
    }
    return base;
  }
  return base.trim() ? `${base.trim()} (${tag})` : tag;
}
