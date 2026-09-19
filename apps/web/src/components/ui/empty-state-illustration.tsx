/** Lightweight inline SVG empty-state accents — no external assets. */
export type EmptyStateIllustrationVariant =
  | "no-expense"
  | "no-group"
  | "no-notification";

const TITLE: Record<EmptyStateIllustrationVariant, string> = {
  "no-expense": "بدون خرج",
  "no-group": "بدون گروه",
  "no-notification": "بدون اعلان",
};

export function EmptyStateIllustration({
  variant,
  className = "",
}: {
  variant: EmptyStateIllustrationVariant;
  className?: string;
}) {
  const title = TITLE[variant];
  return (
    <svg
      className={`emptyStateIllustration ${className}`.trim()}
      width="88"
      height="72"
      viewBox="0 0 88 72"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-hidden={false}
      aria-label={title}
    >
      <title>{title}</title>
      {variant === "no-expense" ? <NoExpenseGlyph /> : null}
      {variant === "no-group" ? <NoGroupGlyph /> : null}
      {variant === "no-notification" ? <NoNotificationGlyph /> : null}
    </svg>
  );
}

function NoExpenseGlyph() {
  return (
    <>
      <rect
        x="18"
        y="14"
        width="52"
        height="44"
        rx="8"
        stroke="currentColor"
        strokeWidth="2"
        opacity="0.45"
      />
      <path
        d="M30 34h28M30 44h18"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        opacity="0.55"
      />
      <circle cx="62" cy="22" r="10" fill="var(--surface, #101816)" stroke="currentColor" strokeWidth="2" />
      <path
        d="M58 22h8M62 18v8"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        opacity="0.7"
      />
    </>
  );
}

function NoGroupGlyph() {
  return (
    <>
      <circle cx="32" cy="28" r="10" stroke="currentColor" strokeWidth="2" opacity="0.55" />
      <circle cx="56" cy="28" r="10" stroke="currentColor" strokeWidth="2" opacity="0.55" />
      <path
        d="M18 56c4-10 14-14 22-14s18 4 22 14"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        opacity="0.45"
      />
      <circle cx="44" cy="22" r="8" stroke="currentColor" strokeWidth="2" opacity="0.7" />
    </>
  );
}

function NoNotificationGlyph() {
  return (
    <>
      <path
        d="M44 12c-10 0-18 7-18 16v8l-6 8h48l-6-8v-8c0-9-8-16-18-16z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
        opacity="0.5"
      />
      <path
        d="M38 56c2 3 4 4 6 4s4-1 6-4"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        opacity="0.55"
      />
      <circle cx="62" cy="20" r="7" stroke="currentColor" strokeWidth="2" opacity="0.65" />
      <path d="M62 17v4M62 24.5v.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </>
  );
}
