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
  borderRadius: "var(--dang-radius-md, 12px)",
  border: "1px solid transparent",
  fontWeight: 700,
  cursor: "pointer",
  minHeight: "var(--dang-control-h, 48px)",
  transition: "transform var(--dang-dur, 160ms) var(--dang-ease, ease), opacity 160ms ease, border-color 160ms ease",
};

const sizes: Record<ButtonSize, CSSProperties> = {
  md: { padding: "0.8125rem 1.25rem", fontSize: "0.9375rem" },
  sm: { padding: "0.5625rem 0.875rem", fontSize: "0.875rem", minHeight: "2.5rem" },
};

const variants: Record<ButtonVariant, CSSProperties> = {
  primary: {
    background: "var(--dang-primary)",
    color: "var(--dang-primary-ink)",
  },
  secondary: {
    background: "var(--dang-gold-soft)",
    color: "var(--dang-gold)",
    borderColor: "color-mix(in srgb, var(--dang-gold) 30%, transparent)",
  },
  ghost: {
    background: "transparent",
    color: "var(--dang-text)",
    borderColor: "var(--dang-line)",
  },
  danger: {
    background: "color-mix(in srgb, var(--dang-danger) 14%, transparent)",
    color: "var(--dang-danger)",
    borderColor: "color-mix(in srgb, var(--dang-danger) 28%, transparent)",
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
