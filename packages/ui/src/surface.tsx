import type { CSSProperties, HTMLAttributes, ReactNode } from "react";

export type SurfaceProps = HTMLAttributes<HTMLElement> & {
  as?: "section" | "div" | "article" | "aside";
  children: ReactNode;
  padded?: boolean;
};

export function Surface({
  as: Tag = "section",
  children,
  padded = true,
  style,
  ...rest
}: SurfaceProps) {
  const surfaceStyle: CSSProperties = {
    background: "var(--dang-surface)",
    border: "1px solid var(--dang-line)",
    borderRadius: "var(--dang-radius-lg, 16px)",
    padding: padded ? "var(--dang-space-5, 24px)" : 0,
    boxShadow: "var(--dang-elev-1, none)",
    ...style,
  };

  return (
    <Tag style={surfaceStyle} {...rest}>
      {children}
    </Tag>
  );
}
