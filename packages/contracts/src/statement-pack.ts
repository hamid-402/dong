/**
 * Organizational statement pack — multi-member workbook shaped like «دونگ تو.xlsx»:
 * one master day×member sheet + one sheet per member (personal lines, shared share, payable, payout).
 *
 * Shared / «هزینه شرکت» costs use existing expense splits:
 * - equal → ÷N
 * - shares / percent / amount → weighted
 */
import type { ExpenseSummary } from "./finance.js";
import { fundingSourceKindLabelFa } from "./finance.js";
import { weekdayFaSatFirst, weekdayUtc } from "./daily-ledger.js";
import {
  buildMemberStatementDetail,
  type MemberStatementDetail,
  type WorkspacePayoutInstructions,
} from "./statements.js";

export type StatementPackMember = {
  userId: string;
  displayName: string;
};

export type StatementPackMeta = {
  workspaceId: string;
  workspaceName: string;
  spaceKindLabel: string;
  from: string;
  to: string;
  documentNo?: string;
  issuedAtIso: string;
  payoutInstructions?: WorkspacePayoutInstructions | null;
  /** Kind-aware formal title override (e.g. صورتحساب شارژ ساختمان). */
  kindDocumentTitle?: string;
  /** Optional letterhead line under the title (accounting desk, building manager…). */
  letterheadNote?: string;
  /** Footer / authenticity note printed on each member page. */
  footerNote?: string;
  /** Optional seal / stamp caption (shown only when provided — never faked). */
  sealLabel?: string;
};

/** Default formal document title from space kind label. */
export function defaultKindDocumentTitle(spaceKindLabel: string): string {
  const k = spaceKindLabel.trim();
  if (/شخصی|personal/i.test(k)) return "صورتحساب شخصی";
  if (/ساختمان|building/i.test(k)) return "صورتحساب شارژ / ساختمان";
  if (/سازمان|org|سازمانی/i.test(k)) return "صورتحساب سازمانی";
  if (/گروه|friends|دوست/i.test(k)) return "صورتحساب گروه";
  return `صورتحساب رسمی — ${k || "فضا"}`;
}

export type StatementPackSheet = {
  name: string;
  rows: string[][];
};

export type StatementPackWorkbook = {
  meta: StatementPackMeta;
  members: StatementPackMember[];
  details: MemberStatementDetail[];
  sheets: StatementPackSheet[];
};

function sheetNameSafe(raw: string, fallback: string): string {
  const cleaned = raw
    .replace(/[\\/*?:\[\]]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 28);
  return cleaned || fallback;
}

function tomanFromMinor(minor: string): string {
  const n = BigInt(minor || "0");
  const toman = n / 10n;
  return toman.toString();
}

function formatFaIssued(iso: string): string {
  try {
    return new Intl.DateTimeFormat("fa-IR", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function eachDateInclusive(from: string, to: string): string[] {
  const out: string[] = [];
  const cur = new Date(`${from}T00:00:00.000Z`);
  const end = new Date(`${to}T00:00:00.000Z`);
  while (cur <= end) {
    out.push(cur.toISOString().slice(0, 10));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return out;
}

/** Classify a statement line as personal consumption vs shared/company share. */
export function isSharedStatementLine(line: {
  splitMethod: string;
  shareRatio: string;
  itemName: string;
}): boolean {
  if (line.splitMethod === "equal" && line.shareRatio !== "1" && line.shareRatio !== "1.0") {
    return true;
  }
  if (line.splitMethod === "shares" || line.splitMethod === "percent") return true;
  if (/شرکت|مشترک|ساختمان|عمومی/i.test(line.itemName)) return true;
  return false;
}

function buildMasterSheet(input: {
  members: StatementPackMember[];
  details: MemberStatementDetail[];
  from: string;
  to: string;
}): string[][] {
  const header: string[] = ["ردیف", "روز", "تاریخ"];
  for (const m of input.members) {
    header.push(m.displayName, "قیمت");
  }
  header.push("مشترک / شرکت", "قیمت مشترک", "جمع کل (تومان)", "توضیحات");

  const byUserDay = new Map<string, Map<string, { title: string; minor: bigint }>>();
  const sharedByDay = new Map<string, { title: string; minor: bigint }>();

  for (const detail of input.details) {
    const dayMap =
      byUserDay.get(detail.userId) ?? new Map<string, { title: string; minor: bigint }>();
    for (const line of detail.lines) {
      if (isSharedStatementLine(line)) continue;
      const prev = dayMap.get(line.date);
      const share = BigInt(line.shareMinor || "0");
      if (!prev) {
        dayMap.set(line.date, { title: line.itemName, minor: share });
      } else {
        dayMap.set(line.date, {
          title: prev.title === line.itemName ? prev.title : `${prev.title} + ${line.itemName}`,
          minor: prev.minor + share,
        });
      }
    }
    byUserDay.set(detail.userId, dayMap);
  }

  // Shared column: take from first detail's shared-classified lines using totalMinor once per expenseId
  const seenExpense = new Set<string>();
  for (const detail of input.details) {
    for (const line of detail.lines) {
      if (!isSharedStatementLine(line)) continue;
      if (seenExpense.has(line.expenseId)) continue;
      seenExpense.add(line.expenseId);
      const prev = sharedByDay.get(line.date) ?? { title: line.itemName, minor: 0n };
      sharedByDay.set(line.date, {
        title: prev.minor === 0n ? line.itemName : `${prev.title} + ${line.itemName}`,
        minor: prev.minor + BigInt(line.totalMinor || "0"),
      });
    }
  }

  const rows: string[][] = [header];
  let rowNo = 1;
  const memberTotals = new Map<string, bigint>();
  let sharedTotal = 0n;
  let grand = 0n;

  for (const date of eachDateInclusive(input.from, input.to)) {
    const weekday = weekdayFaSatFirst(weekdayUtc(date));
    const isFri = weekday === "جمعه";
    const cells: string[] = [String(rowNo), weekday, date];
    let daySum = 0n;

    if (isFri) {
      for (const _m of input.members) {
        cells.push("تعطیل", "تعطیل");
      }
      cells.push("تعطیل", "تعطیل", "تعطیل", "");
      rows.push(cells);
      rowNo += 1;
      continue;
    }

    for (const m of input.members) {
      const cell = byUserDay.get(m.userId)?.get(date);
      if (cell && cell.minor > 0n) {
        cells.push(cell.title, tomanFromMinor(cell.minor.toString()));
        daySum += cell.minor;
        memberTotals.set(m.userId, (memberTotals.get(m.userId) ?? 0n) + cell.minor);
      } else {
        cells.push("-", "-");
      }
    }

    const shared = sharedByDay.get(date);
    if (shared && shared.minor > 0n) {
      cells.push(shared.title, tomanFromMinor(shared.minor.toString()));
      daySum += shared.minor;
      sharedTotal += shared.minor;
    } else {
      cells.push("-", "-");
    }

    cells.push(daySum > 0n ? tomanFromMinor(daySum.toString()) : "0", "");
    grand += daySum;
    rows.push(cells);
    rowNo += 1;
  }

  const totalRow: string[] = ["", "جمع", ""];
  for (const m of input.members) {
    const t = memberTotals.get(m.userId) ?? 0n;
    totalRow.push("", tomanFromMinor(t.toString()));
  }
  totalRow.push(
    "هزینه مشترک",
    tomanFromMinor(sharedTotal.toString()),
    tomanFromMinor(grand.toString()),
    "",
  );
  rows.push(totalRow);
  return rows;
}

function buildMemberSheet(input: {
  member: StatementPackMember;
  detail: MemberStatementDetail;
  memberCount: number;
  meta: StatementPackMeta;
}): string[][] {
  const title =
    input.meta.kindDocumentTitle?.trim() ||
    defaultKindDocumentTitle(input.meta.spaceKindLabel);
  const rows: string[][] = [
    [title, input.meta.workspaceName],
    ["نوع فضا", input.meta.spaceKindLabel],
    ["عضو", input.member.displayName],
    ["بازه", `${input.meta.from} تا ${input.meta.to}`],
    ["شماره سند", input.meta.documentNo ?? "—"],
    ["تاریخ صدور", formatFaIssued(input.meta.issuedAtIso)],
  ];
  if (input.meta.letterheadNote?.trim()) {
    rows.push(["سربرگ", input.meta.letterheadNote.trim()]);
  }
  rows.push([]);
  rows.push(["ردیف", "روز", "تاریخ", "نام کالا / خدمت", "مبلغ (تومان)", "نوع", "نسبت سهم", "منبع / تسویه"]);

  let personalSum = 0n;
  let sharedShareSum = 0n;
  let i = 1;
  for (const line of input.detail.lines) {
    const shared = isSharedStatementLine(line);
    const minor = BigInt(line.shareMinor || "0");
    if (shared) sharedShareSum += minor;
    else personalSum += minor;
    rows.push([
      String(i),
      line.weekdayFa,
      line.date,
      line.itemName,
      tomanFromMinor(line.shareMinor),
      shared ? "مشترک / شرکت" : "شخصی",
      line.shareRatio,
      fundingSourceKindLabelFa(line.fundingSourceKind),
    ]);
    i += 1;
  }

  rows.push([]);
  rows.push(["جمع مصرف شخصی", "", "", "", tomanFromMinor(personalSum.toString()), "", ""]);
  rows.push([
    "سهم هزینه‌های مشترک",
    "",
    "",
    input.memberCount > 1 ? `تقسیم بین ${input.memberCount} عضو (equal/weighted از داده)` : "—",
    tomanFromMinor(sharedShareSum.toString()),
    "",
    "",
  ]);
  rows.push(["جمع سهم کل", "", "", "", tomanFromMinor(input.detail.totalShareMinor), "", ""]);
  rows.push(["پرداخت‌شده توسط عضو", "", "", "", tomanFromMinor(input.detail.totalPaidMinor), "", ""]);
  rows.push(["قابل پرداخت", "", "", "", tomanFromMinor(input.detail.payableMinor), "", ""]);
  rows.push(["بستانکار", "", "", "", tomanFromMinor(input.detail.creditMinor), "", ""]);

  const payout = input.detail.payoutInstructions ?? input.meta.payoutInstructions;
  rows.push([]);
  if (payout) {
    rows.push(["دارنده حساب", payout.holderName]);
    rows.push([
      payout.destinationKind === "card" ? "شماره کارت" : "شبا",
      payout.destinationValue,
    ]);
    if (payout.bankName) rows.push(["بانک", payout.bankName]);
  } else {
    rows.push(["مقصد واریز", "ثبت نشده"]);
  }
  if (input.meta.footerNote?.trim()) {
    rows.push([]);
    rows.push(["یادداشت", input.meta.footerNote.trim()]);
  }
  if (input.meta.sealLabel?.trim()) {
    rows.push(["مهر / امضا", input.meta.sealLabel.trim()]);
  }

  return rows;
}

/**
 * Build the full pack workbook (sheets only — bytes via API xlsx builder).
 */
export function buildStatementPack(input: {
  meta: StatementPackMeta;
  members: StatementPackMember[];
  expenses: readonly ExpenseSummary[];
}): StatementPackWorkbook {
  const details = input.members.map((m) => {
    const detail = buildMemberStatementDetail({
      workspaceId: input.meta.workspaceId,
      userId: m.userId,
      from: input.meta.from,
      to: input.meta.to,
      expenses: input.expenses,
    });
    detail.payoutInstructions = input.meta.payoutInstructions ?? null;
    return detail;
  });

  const sheets: StatementPackSheet[] = [
    {
      name: sheetNameSafe("جدول عمومی", "master"),
      rows: buildMasterSheet({
        members: input.members,
        details,
        from: input.meta.from,
        to: input.meta.to,
      }),
    },
  ];

  for (let idx = 0; idx < input.members.length; idx += 1) {
    const member = input.members[idx]!;
    const detail = details[idx]!;
    sheets.push({
      name: sheetNameSafe(member.displayName, `m${idx + 1}`),
      rows: buildMemberSheet({
        member,
        detail,
        memberCount: input.members.length,
        meta: input.meta,
      }),
    });
  }

  return {
    meta: input.meta,
    members: input.members,
    details,
    sheets,
  };
}

/** Flatten pack to a single CSV (master first, then member sections). */
export function statementPackToCsv(pack: StatementPackWorkbook): string {
  const blocks: string[] = [];
  for (const sheet of pack.sheets) {
    blocks.push(`### ${sheet.name}`);
    for (const row of sheet.rows) {
      blocks.push(
        row
          .map((cell) => {
            if (/[",\n]/.test(cell)) return `"${cell.replaceAll('"', '""')}"`;
            return cell;
          })
          .join(","),
      );
    }
    blocks.push("");
  }
  return `${blocks.join("\n")}\n`;
}

/**
 * Formal print HTML for one member (RTL, letterhead) — used by print pack / PDF path.
 */
export function buildMemberStatementPrintHtml(input: {
  meta: StatementPackMeta;
  member: StatementPackMember;
  detail: MemberStatementDetail;
}): string {
  const { meta, member, detail } = input;
  const docTitle =
    meta.kindDocumentTitle?.trim() || defaultKindDocumentTitle(meta.spaceKindLabel);
  const lines = detail.lines
    .map((l, i) => {
      const source = fundingSourceKindLabelFa(l.fundingSourceKind);
      const note = l.fundingNoteFa?.trim()
        ? `<div class="fund-note">${escapeHtml(l.fundingNoteFa.trim())}</div>`
        : "";
      return `<tr><td>${i + 1}</td><td>${escapeHtml(l.weekdayFa)}</td><td>${escapeHtml(l.date)}</td><td>${escapeHtml(l.itemName)}${note}</td><td>${escapeHtml(tomanFromMinor(l.shareMinor))}</td><td>${escapeHtml(isSharedStatementLine(l) ? "مشترک" : "شخصی")}</td><td>${escapeHtml(source)}</td></tr>`;
    })
    .join("");
  const payout = detail.payoutInstructions ?? meta.payoutInstructions;
  const payoutHtml = payout
    ? `<p><strong>واریز به:</strong> ${escapeHtml(payout.holderName)} — ${escapeHtml(payout.destinationKind === "card" ? "کارت" : "شبا")} ${escapeHtml(payout.destinationValue)}${payout.bankName ? ` (${escapeHtml(payout.bankName)})` : ""}</p>`
    : `<p><strong>مقصد واریز:</strong> ثبت نشده</p>`;
  const letterhead = meta.letterheadNote?.trim()
    ? `<div class="letterhead">${escapeHtml(meta.letterheadNote.trim())}</div>`
    : "";
  const footer = meta.footerNote?.trim()
    ? `<footer class="footer">${escapeHtml(meta.footerNote.trim())}</footer>`
    : "";
  const seal = meta.sealLabel?.trim()
    ? `<div class="seal">${escapeHtml(meta.sealLabel.trim())}</div>`
    : "";

  return `<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
<meta charset="utf-8"/>
<title>${escapeHtml(docTitle)} — ${escapeHtml(member.displayName)}</title>
<style>
  body{font-family:Tahoma,Arial,sans-serif;color:#0f172a;margin:24px;font-size:12px}
  h1{font-size:18px;margin:0 0 4px}
  .letterhead{color:#0f766e;font-weight:600;margin-bottom:8px}
  .meta{color:#475569;margin-bottom:16px}
  table{width:100%;border-collapse:collapse;margin-top:12px}
  th,td{border:1px solid #cbd5e1;padding:6px 8px;text-align:right}
  th{background:#f1f5f9}
  .fund-note{color:#475569;font-size:10px;margin-top:4px;line-height:1.35}
  .totals{margin-top:16px;display:grid;gap:4px}
  .payable{font-size:16px;font-weight:700;color:#0f766e}
  .footer{margin-top:20px;color:#64748b;font-size:11px;border-top:1px solid #e2e8f0;padding-top:8px}
  .seal{margin-top:24px;text-align:left;font-size:11px;color:#334155}
  @media print{body{margin:12mm}}
</style>
</head>
<body>
  <header>
    <h1>${escapeHtml(docTitle)} — ${escapeHtml(meta.workspaceName)}</h1>
    ${letterhead}
    <div class="meta">
      <div>نوع فضا: ${escapeHtml(meta.spaceKindLabel)}</div>
      <div>عضو: ${escapeHtml(member.displayName)}</div>
      <div>بازه: ${escapeHtml(meta.from)} تا ${escapeHtml(meta.to)}</div>
      <div>شماره سند: ${escapeHtml(meta.documentNo ?? "—")}</div>
      <div>صدور: ${escapeHtml(formatFaIssued(meta.issuedAtIso))}</div>
    </div>
  </header>
  <table>
    <thead><tr><th>ردیف</th><th>روز</th><th>تاریخ</th><th>قلم</th><th>مبلغ (تومان)</th><th>نوع</th><th>منبع</th></tr></thead>
    <tbody>${lines || `<tr><td colspan="7">قلمی در این بازه نیست</td></tr>`}</tbody>
  </table>
  <div class="totals">
    <div>جمع سهم: ${escapeHtml(tomanFromMinor(detail.totalShareMinor))} تومان</div>
    <div>پرداخت‌شده: ${escapeHtml(tomanFromMinor(detail.totalPaidMinor))} تومان</div>
    <div class="payable">قابل پرداخت: ${escapeHtml(tomanFromMinor(detail.payableMinor))} تومان</div>
    <div>بستانکار: ${escapeHtml(tomanFromMinor(detail.creditMinor))} تومان</div>
    <p class="fund-note">راهنمای تسویه: بدهی به تنخواه با واریز به صندوق؛ جبران خرج شخصی از مسیر صندوق پس از کسر سهم خود و بدهی قبلی.</p>
    ${payoutHtml}
  </div>
  ${footer}
  ${seal}
</body>
</html>`;
}

export function buildStatementPackPrintHtml(pack: StatementPackWorkbook): string {
  const parts = pack.members.map((member, idx) => {
    const detail = pack.details[idx]!;
    return buildMemberStatementPrintHtml({ meta: pack.meta, member, detail });
  });
  // Strip duplicate html wrappers — join bodies with page breaks
  const bodies = parts.map((html) => {
    const m = /<body[^>]*>([\s\S]*)<\/body>/i.exec(html);
    return m?.[1] ?? html;
  });
  return `<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
<meta charset="utf-8"/>
<title>بسته صورتحساب — ${escapeHtml(pack.meta.workspaceName)}</title>
<style>
  body{font-family:Tahoma,Arial,sans-serif;color:#0f172a;margin:0;font-size:12px}
  .sheet{padding:24px;page-break-after:always}
  .sheet:last-child{page-break-after:auto}
  h1{font-size:18px;margin:0 0 4px}
  .meta{color:#475569;margin-bottom:16px}
  table{width:100%;border-collapse:collapse;margin-top:12px}
  th,td{border:1px solid #cbd5e1;padding:6px 8px;text-align:right}
  th{background:#f1f5f9}
  .fund-note{color:#475569;font-size:10px;margin-top:4px;line-height:1.35}
  .totals{margin-top:16px;display:grid;gap:4px}
  .payable{font-size:16px;font-weight:700;color:#0f766e}
  .footer{margin-top:20px;color:#64748b;font-size:11px;border-top:1px solid #e2e8f0;padding-top:8px}
  .seal{margin-top:24px;text-align:left;font-size:11px;color:#334155}
  @media print{.sheet{padding:12mm}}
</style>
</head>
<body>
${bodies.map((b) => `<section class="sheet">${b}</section>`).join("\n")}
<script>
  window.addEventListener("load", function () {
    setTimeout(function () { window.print(); }, 250);
  });
</script>
</body>
</html>`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
