const MIME_BY_EXTENSION: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".pdf": "application/pdf",
};

const PAYMENT_RECEIPT_MIME = new Set([
  "image/jpeg",
  "image/png",
  "application/pdf",
]);

/** Resolve MIME for API allow-list; rejects unsupported types. */
export function resolveUploadMimeType(file: File): string {
  const fromBrowser = file.type?.trim().toLowerCase();
  if (
    fromBrowser &&
    fromBrowser !== "application/octet-stream" &&
    Object.values(MIME_BY_EXTENSION).includes(fromBrowser)
  ) {
    return fromBrowser;
  }
  const name = file.name.toLowerCase();
  const ext = name.slice(name.lastIndexOf("."));
  const fromExt = MIME_BY_EXTENSION[ext];
  if (fromExt) return fromExt;
  throw new Error("فرمت فایل پشتیبانی نمی‌شود (JPEG، PNG، WebP، PDF)");
}

/** Payment receipt evidence: JPG/PNG/PDF only (no webp). */
export function resolvePaymentReceiptMimeType(file: File): string {
  const mime = resolveUploadMimeType(file);
  if (!PAYMENT_RECEIPT_MIME.has(mime)) {
    throw new Error("نوع فایل رسید باید JPG، PNG یا PDF باشد");
  }
  return mime;
}

export async function sha256HexFromFile(file: File): Promise<string> {  const buffer = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function readFileAsBase64(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}
