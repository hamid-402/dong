import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from "react";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "md" | "sm";

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  children: ReactNode;
};

const base: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
  borderRadius: 999,
  border: "1px solid transparent",
  fontWeight: 700,
  cursor: "pointer",
  transition: "transform 160ms cubic-bezier(.2,.8,.2,1), opacity 160ms ease",
};

const sizes: Record<ButtonSize, CSSProperties> = {
  md: { padding: "12px 18px", fontSize: 14 },
  sm: { padding: "8px 14px", fontSize: 13 },
};

const variants: Record<ButtonVariant, CSSProperties> = {
  primary: {
    background: "linear-gradient(135deg, var(--dang-primary, #57d7c5), #3fb9aa)",
    color: "var(--dang-primary-ink, #062f2b)",
  },
  secondary: {
    background: "var(--dang-gold-soft, rgba(201,170,112,.13))",
    color: "var(--dang-gold, #c9aa70)",
    borderColor: "rgba(201,170,112,.28)",
  },
  ghost: {
    background: "transparent",
    color: "var(--dang-text, #f3f1e9)",
    borderColor: "var(--dang-line, rgba(220,229,225,.11))",
  },
  danger: {
    background: "rgba(237,124,120,.14)",
    color: "var(--dang-danger, #ed7c78)",
    borderColor: "rgba(237,124,120,.28)",
  },
};

export function Button({
  variant = "primary",
  size = "md",
  style,
  disabled,
  children,
  type = "button",
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled}
      style={{
        ...base,
        ...sizes[size],
        ...variants[variant],
        opacity: disabled ? 0.55 : 1,
        cursor: disabled ? "not-allowed" : "pointer",
        ...style,
      }}
      {...rest}
    >
      {children}
    </button>
  );
}
