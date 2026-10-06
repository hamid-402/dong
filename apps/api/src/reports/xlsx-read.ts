/**
 * Minimal OOXML (.xlsx) reader for Dong-To / ledger import.
 * Supports shared strings + inlineStr + numeric cells (Excel default).
 * Prefers central-directory offsets when local headers omit sizes (Excel bit 3).
 */
import { inflateRawSync } from "node:zlib";

function readZipEntries(buf: Buffer): Map<string, Buffer> {
  const out = new Map<string, Buffer>();

  // End of central directory
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0; i -= 1) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }

  if (eocd >= 0) {
    const centralCount = buf.readUInt16LE(eocd + 10);
    let centralOffset = buf.readUInt32LE(eocd + 16);
    for (let n = 0; n < centralCount; n += 1) {
      if (buf.readUInt32LE(centralOffset) !== 0x02014b50) break;
      const method = buf.readUInt16LE(centralOffset + 10);
      const compSize = buf.readUInt32LE(centralOffset + 20);
      const nameLen = buf.readUInt16LE(centralOffset + 28);
      const extraLen = buf.readUInt16LE(centralOffset + 30);
      const commentLen = buf.readUInt16LE(centralOffset + 32);
      const localOffset = buf.readUInt32LE(centralOffset + 42);
      const name = buf
        .subarray(centralOffset + 46, centralOffset + 46 + nameLen)
        .toString("utf8")
        .replaceAll("\\", "/");

      const localNameLen = buf.readUInt16LE(localOffset + 26);
      const localExtraLen = buf.readUInt16LE(localOffset + 28);
      const dataStart = localOffset + 30 + localNameLen + localExtraLen;
      const compressed = buf.subarray(dataStart, dataStart + compSize);
      let data: Buffer;
      if (method === 0) data = Buffer.from(compressed);
      else if (method === 8) data = inflateRawSync(compressed);
      else {
        centralOffset += 46 + nameLen + extraLen + commentLen;
        continue;
      }
      out.set(name, data);
      centralOffset += 46 + nameLen + extraLen + commentLen;
    }
    if (out.size > 0) return out;
  }

  // Fallback: walk local headers
  let offset = 0;
  while (offset + 30 <= buf.length) {
    const sig = buf.readUInt32LE(offset);
    if (sig !== 0x04034b50) break;
    const method = buf.readUInt16LE(offset + 8);
    const compSize = buf.readUInt32LE(offset + 18);
    const nameLen = buf.readUInt16LE(offset + 26);
    const extraLen = buf.readUInt16LE(offset + 28);
    const name = buf
      .subarray(offset + 30, offset + 30 + nameLen)
      .toString("utf8")
      .replaceAll("\\", "/");
    const dataStart = offset + 30 + nameLen + extraLen;
    const compressed = buf.subarray(dataStart, dataStart + compSize);
    let data: Buffer;
    if (method === 0) data = Buffer.from(compressed);
    else if (method === 8) data = inflateRawSync(compressed);
    else {
      offset = dataStart + compSize;
      continue;
    }
    out.set(name, data);
    offset = dataStart + compSize;
  }
  return out;
}

function decodeXmlEntities(value: string): string {
  return value
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll("&amp;", "&");
}

function parseSharedStrings(xml: string): string[] {
  const out: string[] = [];
  const siRe = /<si\b[^>]*>([\s\S]*?)<\/si>/gi;
  let m: RegExpExecArray | null;
  while ((m = siRe.exec(xml))) {
    const block = m[1] ?? "";
    const texts = [...block.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/gi)].map((x) =>
      decodeXmlEntities(x[1] ?? ""),
    );
    out.push(texts.join(""));
  }
  return out;
}

function colLettersToIndex(letters: string): number {
  let n = 0;
  for (const ch of letters.toUpperCase()) {
    n = n * 26 + (ch.charCodeAt(0) - 64);
  }
  return n - 1;
}

function parseSheetMatrix(xml: string, shared: string[]): string[][] {
  const rows = new Map<number, Map<number, string>>();
  const rowRe = /<row\b[^>]*(?:\br="(\d+)")?[^>]*>([\s\S]*?)<\/row>/gi;
  let rowMatch: RegExpExecArray | null;
  let implicitRow = 0;
  while ((rowMatch = rowRe.exec(xml))) {
    const rowNum = rowMatch[1] ? Number(rowMatch[1]) - 1 : implicitRow;
    implicitRow = rowNum + 1;
    const inner = rowMatch[2] ?? "";
    const cellRe = /<c\b([^>]*)>([\s\S]*?)<\/c>|<c\b([^>]*)\/>/gi;
    let cellMatch: RegExpExecArray | null;
    let implicitCol = 0;
    while ((cellMatch = cellRe.exec(inner))) {
      const attrs = cellMatch[1] ?? cellMatch[3] ?? "";
      const body = cellMatch[2] ?? "";
      const ref = /\br="([A-Z]+)(\d+)"/i.exec(attrs);
      const col = ref ? colLettersToIndex(ref[1]!) : implicitCol;
      implicitCol = col + 1;
      const type = /\bt="([^"]+)"/i.exec(attrs)?.[1] ?? "";
      let value = "";
      if (type === "inlineStr") {
        const t = /<t[^>]*>([\s\S]*?)<\/t>/i.exec(body);
        value = decodeXmlEntities(t?.[1] ?? "");
      } else if (type === "s") {
        const v = /<v[^>]*>([\s\S]*?)<\/v>/i.exec(body);
        const idx = Number(v?.[1] ?? "");
        value = Number.isFinite(idx) ? (shared[idx] ?? "") : "";
      } else {
        const v = /<v[^>]*>([\s\S]*?)<\/v>/i.exec(body);
        value = decodeXmlEntities(v?.[1] ?? "");
      }
      if (!rows.has(rowNum)) rows.set(rowNum, new Map());
      rows.get(rowNum)!.set(col, value);
    }
  }

  const maxRow = Math.max(-1, ...rows.keys());
  const matrix: string[][] = [];
  for (let r = 0; r <= maxRow; r += 1) {
    const cols = rows.get(r);
    if (!cols) {
      matrix.push([]);
      continue;
    }
    const maxCol = Math.max(-1, ...cols.keys());
    const line: string[] = [];
    for (let c = 0; c <= maxCol; c += 1) line.push(cols.get(c) ?? "");
    matrix.push(line);
  }
  return matrix;
}

export type XlsxSheetMatrix = { name: string; rows: string[][] };

/** Read workbook sheets into string matrices (best-effort). */
export function readXlsxMatrices(buf: Buffer): XlsxSheetMatrix[] {
  const files = readZipEntries(buf);
  const sharedXml = files.get("xl/sharedStrings.xml")?.toString("utf8") ?? "";
  const shared = sharedXml ? parseSharedStrings(sharedXml) : [];

  const workbookXml = files.get("xl/workbook.xml")?.toString("utf8") ?? "";
  const sheetMetas: Array<{ name: string; rid: string }> = [];
  const sheetRe =
    /<sheet\b[^>]*name="([^"]+)"[^>]*r:id="([^"]+)"[^>]*\/>|<sheet\b[^>]*r:id="([^"]+)"[^>]*name="([^"]+)"[^>]*\/>/gi;
  let sm: RegExpExecArray | null;
  while ((sm = sheetRe.exec(workbookXml))) {
    if (sm[1] && sm[2]) sheetMetas.push({ name: sm[1], rid: sm[2] });
    else if (sm[3] && sm[4]) sheetMetas.push({ name: sm[4], rid: sm[3] });
  }

  const relsXml = files.get("xl/_rels/workbook.xml.rels")?.toString("utf8") ?? "";
  const ridToTarget = new Map<string, string>();
  const relRe = /<Relationship\b[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"[^>]*\/>/gi;
  let rm: RegExpExecArray | null;
  while ((rm = relRe.exec(relsXml))) {
    ridToTarget.set(rm[1]!, rm[2]!.replace(/^\//, ""));
  }

  const out: XlsxSheetMatrix[] = [];
  if (sheetMetas.length === 0) {
    const xml = files.get("xl/worksheets/sheet1.xml")?.toString("utf8");
    if (xml) out.push({ name: "Sheet1", rows: parseSheetMatrix(xml, shared) });
    return out;
  }

  for (const meta of sheetMetas) {
    let target = ridToTarget.get(meta.rid) ?? "";
    if (target && !target.startsWith("xl/")) target = `xl/${target.replace(/^\.\//, "")}`;
    const xml = files.get(target)?.toString("utf8");
    if (!xml) continue;
    out.push({ name: meta.name, rows: parseSheetMatrix(xml, shared) });
  }
  return out;
}
