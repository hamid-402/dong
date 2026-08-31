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
    background: "var(--dang-surface, #101816)",
    border: "1px solid var(--dang-line, rgba(220,229,225,.11))",
    borderRadius: 24,
    padding: padded ? 28 : 0,
    boxShadow: "0 28px 90px rgba(0,0,0,.22)",
    ...style,
  };

  return (
    <Tag style={surfaceStyle} {...rest}>
      {children}
    </Tag>
  );
}
