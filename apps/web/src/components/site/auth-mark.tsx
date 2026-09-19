/** Shared brand mark — used by marketing + auth chrome. */
export function AuthMark({ size = "md" }: { size?: "sm" | "md" }) {
  const dim = size === "sm" ? 18 : 22;
  return (
    <span className={`authLayout__mark authLayout__mark--${size}`} aria-hidden>
      <svg width={dim} height={dim} viewBox="0 0 24 24" fill="none">
        <path
          d="M6 18V6l6 6 6-6v12"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}
