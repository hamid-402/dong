import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cx } from "./cx.js";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "md" | "sm";

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: ReactNode;
  children?: ReactNode;
};

export function Spinner({ label }: { label?: string }) {
  return <span className="dang-spinner" role={label ? "status" : undefined} aria-label={label} aria-hidden={label ? undefined : true} />;
}

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  icon,
  className,
  disabled,
  children,
  type = "button",
  ...rest
}: ButtonProps) {
  const isDisabled = Boolean(disabled || loading);
  return (
    <button
      type={type}
      disabled={isDisabled}
      aria-busy={loading || undefined}
      className={cx("dang-btn", `dang-btn--${variant}`, `dang-btn--${size}`, className)}
      {...rest}
    >
      {loading ? <Spinner /> : icon ? <span className="dang-btn__icon" aria-hidden="true">{icon}</span> : null}
      {children}
    </button>
  );
}
