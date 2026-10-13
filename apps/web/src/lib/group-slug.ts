const SLUG_MAX = 48;
const ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";

/** Persian and Arabic letters used in group names → ASCII slug pieces. */
const FA_TO_LATIN: Record<string, string> = {
  ا: "a",
  آ: "a",
  أ: "a",
  إ: "a",
  ٱ: "a",
  ب: "b",
  پ: "p",
  ت: "t",
  ث: "s",
  ج: "j",
  چ: "ch",
  ح: "h",
  خ: "kh",
  د: "d",
  ذ: "z",
  ر: "r",
  ز: "z",
  ژ: "zh",
  س: "s",
  ش: "sh",
  ص: "s",
  ض: "z",
  ط: "t",
  ظ: "z",
  ع: "a",
  غ: "gh",
  ف: "f",
  ق: "gh",
  ک: "k",
  ك: "k",
  گ: "g",
  ل: "l",
  م: "m",
  ن: "n",
  و: "v",
  ؤ: "v",
  ه: "h",
  ة: "h",
  ی: "y",
  ي: "y",
  ئ: "y",
  ى: "y",
  "۰": "0",
  "۱": "1",
  "۲": "2",
  "۳": "3",
  "۴": "4",
  "۵": "5",
  "۶": "6",
  "۷": "7",
  "۸": "8",
  "۹": "9",
};

export type GroupSlugTemplate = "friends_family" | "household";

export function transliterateGroupName(name: string): string {
  let out = "";
  for (const ch of name.normalize("NFKC")) {
    const mapped = FA_TO_LATIN[ch];
    if (mapped !== undefined) {
      out += mapped;
      continue;
    }
    if (/[a-z0-9]/i.test(ch)) {
      out += ch.toLowerCase();
      continue;
    }
    if (/\s/u.test(ch) || ch === "-" || ch === "_" || ch === "\u200c") {
      out += "-";
    }
  }
  return out
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 28);
}

/** Short suffix so two creates of the same Persian name do not share a slug. */
export function randomSlugSuffix(length = 5): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = "";
  for (const byte of bytes) {
    out += ALPHABET[byte % ALPHABET.length] ?? "a";
  }
  return out;
}

export function groupSlugFromName(
  name: string,
  template: GroupSlugTemplate,
  suffix = randomSlugSuffix(),
): string {
  const prefix = template === "household" ? "family" : "friends";
  const stem = transliterateGroupName(name);
  const tail =
    suffix
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "")
      .slice(0, 8) || randomSlugSuffix();
  const body = stem ? `${stem}-${tail}` : tail;
  let slug = `${prefix}-${body}`.replace(/-+/g, "-").replace(/^-+|-+$/g, "");
  if (slug.length > SLUG_MAX) {
    slug = slug.slice(0, SLUG_MAX).replace(/-+$/g, "");
  }
  return slug;
}

export function isWorkspaceSlugTaken(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const status = (err as { status?: unknown }).status;
  const message = err instanceof Error ? err.message : "";
  return status === 409 && /slug/i.test(message);
}

/**
 * Create a group workspace, minting a new slug when the previous one is taken.
 * Each attempt is a different slug, so a simultaneous create does not stick on one id.
 */
export async function createWorkspaceWithUniqueSlug<T>(
  input: {
    name: string;
    template: GroupSlugTemplate;
    ownerDefaultShares: number;
  },
  create: (body: {
    name: string;
    slug: string;
    template: GroupSlugTemplate;
    ownerDefaultShares: number;
  }) => Promise<T>,
  options?: { attempts?: number; suffix?: () => string },
): Promise<T> {
  const attempts = Math.max(1, options?.attempts ?? 3);
  for (let i = 0; i < attempts; i += 1) {
    const slug = groupSlugFromName(input.name, input.template, options?.suffix?.());
    try {
      return await create({ ...input, slug });
    } catch (err) {
      if (!isWorkspaceSlugTaken(err) || i === attempts - 1) throw err;
    }
  }
  throw new Error("WORKSPACE_SLUG_TAKEN");
}
