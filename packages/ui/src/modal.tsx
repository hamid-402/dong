import type { CSSProperties, HTMLAttributes, ReactNode } from "react";

export type ModalProps = HTMLAttributes<HTMLDivElement> & {
  open: boolean;
  title: string;
  children: ReactNode;
  onClose?: () => void;
};

/** Accessible dialog shell for forms (not decorative card chrome). */
export function Modal({ open, title, children, onClose, style, ...rest }: ModalProps) {
  if (!open) return null;
  const backdrop: CSSProperties = {
    position: "fixed",
    inset: 0,
    background: "color-mix(in srgb, var(--dang-ink, #111) 45%, transparent)",
    display: "grid",
    placeItems: "center",
    padding: "var(--dang-space-4, 16px)",
    zIndex: 40,
  };
  const panel: CSSProperties = {
    width: "min(100%, 28rem)",
    background: "var(--dang-surface, #fff)",
    color: "var(--dang-ink, #111)",
    border: "1px solid var(--dang-line, #ddd)",
    borderRadius: "var(--dang-radius-lg, 16px)",
    padding: "var(--dang-space-5, 24px)",
    boxShadow: "var(--dang-elev-2, 0 8px 24px rgba(0,0,0,.12))",
    ...style,
  };
  return (
    <div style={backdrop} role="presentation" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        style={panel}
        onClick={(e) => e.stopPropagation()}
        {...rest}
      >
        <h2 style={{ margin: "0 0 1rem", fontSize: "1.125rem" }}>{title}</h2>
        {children}
      </div>
    </div>
  );
}

export type SkeletonProps = HTMLAttributes<HTMLDivElement> & {
  height?: number | string;
  width?: number | string;
};

export function Skeleton({ height = "1rem", width = "100%", style, ...rest }: SkeletonProps) {
  const skeletonStyle: CSSProperties = {
    height,
    width,
    borderRadius: "var(--dang-radius-sm, 8px)",
    background:
      "linear-gradient(90deg, color-mix(in srgb, var(--dang-line, #ddd) 70%, transparent), color-mix(in srgb, var(--dang-line, #ddd) 35%, transparent), color-mix(in srgb, var(--dang-line, #ddd) 70%, transparent))",
    backgroundSize: "200% 100%",
    animation: "dang-skeleton 1.2s ease-in-out infinite",
    ...style,
  };
  return <div aria-hidden style={skeletonStyle} {...rest} />;
}
