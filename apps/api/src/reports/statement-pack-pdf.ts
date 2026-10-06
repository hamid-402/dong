/**
 * Binary PDF for statement pack — table layout + RTL visual order for Persian.
 * Uses Vazirmatn when bundled; otherwise Helvetica (Latin-only fallback).
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import PDFDocument from "pdfkit";
import {
  defaultKindDocumentTitle,
  formatJalaliIso,
  isSharedStatementLine,
  type StatementPackWorkbook,
} from "@dang/contracts";

const PERSIAN_DIGITS = "۰۱۲۳۴۵۶۷۸۹";

function toPersianDigits(raw: string): string {
  return raw.replace(/\d/g, (d) => PERSIAN_DIGITS[Number(d)] ?? d);
}

function tomanFromMinor(minor: string): string {
  const n = BigInt(minor || "0");
  const toman = n / 10n;
  return toPersianDigits(toman.toLocaleString("en-US"));
}

function formatFaDate(isoDate: string): string {
  const day = isoDate.includes("T")
    ? isoDate.slice(0, 10)
    : isoDate.trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return toPersianDigits(isoDate);
  return toPersianDigits(formatJalaliIso(day));
}

function formatFaIssued(iso: string): string {
  try {
    return new Intl.DateTimeFormat("fa-IR", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return toPersianDigits(iso);
  }
}

function resolveFontPath(): string | null {
  const candidates = [
    join(__dirname, "../../assets/fonts/Vazirmatn-Regular.ttf"),
    join(process.cwd(), "assets/fonts/Vazirmatn-Regular.ttf"),
    join(process.cwd(), "apps/api/assets/fonts/Vazirmatn-Regular.ttf"),
  ];
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  return null;
}

export function statementPackPdfFontAvailable(): boolean {
  return resolveFontPath() != null;
}

export function statementPackPdfProviderMode():
  | "pdfkit_vazir_v1"
  | "unavailable" {
  return statementPackPdfFontAvailable() ? "pdfkit_vazir_v1" : "unavailable";
}

/**
 * Visual RTL for pdfkit (LTR engine): reverse Arabic/Persian letter runs
 * while keeping ASCII / Persian / Arabic-Indic digits in logical order.
 */
export function rtlVisual(input: string): string {
  const isDigit = (ch: string) =>
    /[0-9\u0660-\u0669\u06F0-\u06F9]/.test(ch);
  const isRtlLetter = (ch: string) =>
    /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/.test(ch) && !isDigit(ch);
  const parts: string[] = [];
  let buf = "";
  let mode: "rtl" | "ltr" | null = null;
  const flush = () => {
    if (!buf) return;
    parts.push(mode === "rtl" ? [...buf].reverse().join("") : buf);
    buf = "";
  };
  for (const ch of input) {
    const next: "rtl" | "ltr" = isRtlLetter(ch) ? "rtl" : "ltr";
    if (mode == null) mode = next;
    if (next !== mode) {
      flush();
      mode = next;
    }
    buf += ch;
  }
  flush();
  return parts.reverse().join("");
}

function collectBuffers(doc: PDFKit.PDFDocument): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
}

function drawTable(
  doc: PDFKit.PDFDocument,
  opts: {
    x: number;
    y: number;
    colWidths: number[];
    rows: string[][];
    fontSize: number;
    rtl: boolean;
    fontName: string;
  },
): number {
  const { x, colWidths, rows, fontSize, rtl, fontName } = opts;
  let y = opts.y;
  const rowH = fontSize + 10;

  for (let r = 0; r < rows.length; r += 1) {
    if (y + rowH > doc.page.height - 48) {
      doc.addPage();
      y = 48;
    }
    let cx = x;
    for (let c = 0; c < colWidths.length; c += 1) {
      const w = colWidths[c]!;
      const raw = rows[r]?.[c] ?? "";
      const text = rtl ? rtlVisual(raw) : raw;
      doc.rect(cx, y, w, rowH).stroke("#cbd5e1");
      if (r === 0) {
        doc.save();
        doc.rect(cx, y, w, rowH).fill("#f1f5f9");
        doc.restore();
        doc.rect(cx, y, w, rowH).stroke("#cbd5e1");
      }
      doc
        .font(fontName)
        .fontSize(fontSize)
        .fillColor("#0f172a")
        .text(text, cx + 3, y + 4, {
          width: w - 6,
          align: rtl ? "right" : "left",
          lineBreak: false,
          height: rowH - 4,
        });
      cx += w;
    }
    y += rowH;
  }
  return y;
}

function pdfText(
  doc: PDFKit.PDFDocument,
  text: string,
  x: number,
  y: number,
  opts: PDFKit.Mixins.TextOptions & { useVazir: boolean; fontName: string },
) {
  const { useVazir, fontName, ...textOpts } = opts;
  doc.font(fontName).text(useVazir ? rtlVisual(text) : text, x, y, textOpts);
}

/** Build a multi-page formal PDF (one page per member) with table grid. */
export async function buildStatementPackPdf(
  pack: StatementPackWorkbook,
): Promise<Buffer> {
  const fontPath = resolveFontPath();
  const doc = new PDFDocument({
    size: "A4",
    margin: 40,
    info: {
      Title: `صورتحساب — ${pack.meta.workspaceName}`,
      Author: "دنگ",
      Subject: pack.meta.documentNo ?? "statement-pack",
    },
  });
  const done = collectBuffers(doc);
  const useVazir = Boolean(fontPath);
  const fontName = useVazir ? "Vazir" : "Helvetica";
  if (fontPath) {
    doc.registerFont("Vazir", fontPath);
    doc.font("Vazir");
  } else {
    doc.font("Helvetica");
  }

  const title =
    pack.meta.kindDocumentTitle?.trim() ||
    defaultKindDocumentTitle(pack.meta.spaceKindLabel);
  const pageW = doc.page.width - 80;

  for (let i = 0; i < pack.members.length; i += 1) {
    if (i > 0) doc.addPage();
    const member = pack.members[i]!;
    const detail = pack.details[i]!;
    let y = 40;

    doc.fontSize(15).fillColor("#0f172a");
    pdfText(doc, `${title} — ${pack.meta.workspaceName}`, 40, y, {
      width: pageW,
      align: "right",
      useVazir,
      fontName,
    });
    y += 22;

    if (pack.meta.letterheadNote?.trim()) {
      doc.fontSize(10).fillColor("#0f766e");
      pdfText(doc, pack.meta.letterheadNote.trim(), 40, y, {
        width: pageW,
        align: "right",
        useVazir,
        fontName,
      });
      y += 16;
    }

    doc.fontSize(9).fillColor("#475569");
    const metaBlock = [
      `نوع فضا: ${pack.meta.spaceKindLabel}`,
      `عضو: ${member.displayName}`,
      `بازه: ${formatFaDate(pack.meta.from)} تا ${formatFaDate(pack.meta.to)}`,
      `شماره سند: ${toPersianDigits(pack.meta.documentNo ?? "—")}`,
      `تاریخ صدور: ${formatFaIssued(pack.meta.issuedAtIso)}`,
    ];
    for (const line of metaBlock) {
      pdfText(doc, line, 40, y, {
        width: pageW,
        align: "right",
        useVazir,
        fontName,
      });
      y += 12;
    }
    y += 8;

    const header = [
      "ردیف",
      "روز",
      "تاریخ",
      "نام کالا / خدمت",
      "مبلغ (تومان)",
      "نوع",
    ];
    const body = detail.lines.slice(0, 45).map((line, idx) => [
      toPersianDigits(String(idx + 1)),
      line.weekdayFa,
      formatFaDate(line.date),
      line.itemName,
      tomanFromMinor(line.shareMinor),
      isSharedStatementLine(line) ? "مشترک" : "شخصی",
    ]);
    const tableRows = [header, ...body];
    const colWidths = [36, 52, 78, pageW - 36 - 52 - 78 - 78 - 52, 78, 52];
    y = drawTable(doc, {
      x: 40,
      y,
      colWidths,
      rows: tableRows,
      fontSize: 8,
      rtl: useVazir,
      fontName,
    });
    if (detail.lines.length > 45) {
      y += 6;
      doc.fontSize(8).fillColor("#64748b");
      pdfText(
        doc,
        `… و ${toPersianDigits(String(detail.lines.length - 45))} قلم دیگر`,
        40,
        y,
        { width: pageW, align: "right", useVazir, fontName },
      );
      y += 14;
    }

    y += 10;
    doc.fontSize(10).fillColor("#0f172a");
    const totals = [
      `جمع سهم: ${tomanFromMinor(detail.totalShareMinor)} تومان`,
      `پرداخت‌شده: ${tomanFromMinor(detail.totalPaidMinor)} تومان`,
      `قابل پرداخت: ${tomanFromMinor(detail.payableMinor)} تومان`,
      `بستانکار: ${tomanFromMinor(detail.creditMinor)} تومان`,
    ];
    for (const line of totals) {
      pdfText(doc, line, 40, y, {
        width: pageW,
        align: "right",
        useVazir,
        fontName,
      });
      y += 14;
    }

    const payout = detail.payoutInstructions ?? pack.meta.payoutInstructions;
    if (payout) {
      y += 4;
      const pay = `واریز: ${payout.holderName} — ${payout.destinationKind === "card" ? "کارت" : "شبا"} ${toPersianDigits(payout.destinationValue)}${payout.bankName ? ` — بانک ${payout.bankName}` : ""}`;
      pdfText(doc, pay, 40, y, {
        width: pageW,
        align: "right",
        useVazir,
        fontName,
      });
      y += 14;
    }

    if (pack.meta.footerNote?.trim()) {
      y += 8;
      doc.fontSize(8).fillColor("#64748b");
      pdfText(doc, pack.meta.footerNote.trim(), 40, y, {
        width: pageW,
        align: "right",
        useVazir,
        fontName,
      });
      y += 12;
    }
    if (pack.meta.sealLabel?.trim()) {
      y += 16;
      doc.fontSize(9).fillColor("#334155");
      pdfText(doc, pack.meta.sealLabel.trim(), 40, y, {
        width: pageW,
        align: "left",
        useVazir,
        fontName,
      });
    }
  }

  doc.end();
  return done;
}

export function readBundledFontBytes(): Buffer | null {
  const p = resolveFontPath();
  return p ? readFileSync(p) : null;
}
