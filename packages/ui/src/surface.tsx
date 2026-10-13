import type { HTMLAttributes, ReactNode } from "react";
import { cx } from "./cx.js";

export type SurfaceProps = HTMLAttributes<HTMLElement> & {
  as?: "section" | "div" | "article" | "aside";
  children: ReactNode;
  padded?: boolean;
};

export function Surface({
  as: Tag = "section",
  children,
  padded = true,
  className,
  ...rest
}: SurfaceProps) {
  return (
    <Tag className={cx("dang-card", padded && "dang-card--padded", className)} {...rest}>
      {children}
    </Tag>
  );
}

export const Card = Surface;
