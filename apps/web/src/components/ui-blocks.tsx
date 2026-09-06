"use client";

import type { ReactNode } from "react";
import { useHubEmbed } from "@/components/mosaic/hub-embed";

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  const embedded = useHubEmbed();

  /* Inside hub the mosaic content-frame already owns the page title. */
  if (embedded) {
    return (
      <div className="moduleChrome">
        {description ? <p className="moduleChrome__desc">{description}</p> : null}
        {actions ? <div className="moduleChrome__actions productHeaderActions">{actions}</div> : null}
      </div>
    );
  }

  return (
    <div className="greeting animated productHeader">
      <div>
        <span className="eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
        {description ? <p>{description}</p> : null}
      </div>
      {actions ? <div className="productHeaderActions">{actions}</div> : null}
    </div>
  );
}

export function SectionCard({
  title,
  badge,
  children,
  delayClass,
  className = "",
  tone = "default",
}: {
  title: string;
  badge?: ReactNode;
  children: ReactNode;
  delayClass?: string;
  className?: string;
  /** quiet = secondary panels (reports) — lighter visual weight */
  tone?: "default" | "quiet";
}) {
  return (
    <section
      className={`sectionCard card animated sectionCard--${tone} ${delayClass ?? ""} ${className}`.trim()}
    >
      <div className="sectionCardHead">
        <b>{title}</b>
        {badge != null ? <span className="sectionBadge">{badge}</span> : null}
      </div>
      <div className="sectionCardBody">{children}</div>
    </section>
  );
}

export function DataList({ children }: { children: ReactNode }) {
  return <div className="dataList">{children}</div>;
}

export function DataRow({
  title,
  meta,
  trailing,
  actions,
}: {
  title: ReactNode;
  meta?: ReactNode;
  trailing?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <article className="dataRow">
      <div className="dataRowMain">
        <b>{title}</b>
        {meta ? <small>{meta}</small> : null}
        {actions ? <div className="dataRowActions">{actions}</div> : null}
      </div>
      {trailing ? <div className="dataRowTrailing">{trailing}</div> : null}
    </article>
  );
}

export function StatusPill({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "ok" | "warn" | "danger" | "gold";
}) {
  return <span className={`statusPill tone-${tone}`}>{children}</span>;
}

export function EmptyHint({ children }: { children: ReactNode }) {
  return <p className="emptyHint">{children}</p>;
}

/** Short live status line — not a dashed empty state. */
export function StatusLine({ children }: { children: ReactNode }) {
  return <p className="statusLine">{children}</p>;
}

export function FormStack({
  children,
  density = "default",
}: {
  children: ReactNode;
  density?: "default" | "compact" | "inline";
}) {
  return <div className={`formStack formStack--${density}`}>{children}</div>;
}

export function ProductGrid({ children, cols }: { children: ReactNode; cols?: 1 | 2 }) {
  return <div className={cols === 2 ? "productGrid cols-2" : "productGrid"}>{children}</div>;
}

export function HeroBalance({
  label,
  amount,
  subtitle,
  actionLabel,
  onAction,
  hint,
}: {
  label: string;
  amount: string;
  subtitle: string;
  actionLabel: string;
  onAction: () => void;
  hint?: string;
}) {
  return (
    <article className="balanceCard card animated">
      <div className="balanceCard__top">
        <span>{label}</span>
        {hint ? <small className="balanceCard__hint">{hint}</small> : null}
      </div>
      <strong className="balanceCard__amount">{amount}</strong>
      <p className="balanceCard__sub">{subtitle}</p>
      <button type="button" className="balanceCard__cta" onClick={onAction}>
        {actionLabel}
      </button>
    </article>
  );
}

export function QuickAction({
  title,
  description,
  onClick,
  delayClass,
  icon,
}: {
  title: string;
  description: string;
  onClick: () => void;
  delayClass?: string;
  icon?: ReactNode;
}) {
  return (
    <button
      className={`actionCard card animated ${delayClass ?? ""}`.trim()}
      type="button"
      onClick={onClick}
    >
      <span className="actionIcon" aria-hidden>
        {icon ?? "←"}
      </span>
      <span className="actionCard__copy">
        <b>{title}</b>
        <small>{description}</small>
      </span>
      <i className="actionCard__chev" aria-hidden>
        ‹
      </i>
    </button>
  );
}

export function PanelList({
  title,
  badge,
  children,
  footer,
  delayClass,
}: {
  title: string;
  badge?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  delayClass?: string;
}) {
  return (
    <section className={`panel card animated ${delayClass ?? ""}`.trim()}>
      <div className="panelHeader">
        <b>{title}</b>
        {badge != null ? <span>{badge}</span> : null}
      </div>
      <div className="tasks">{children}</div>
      {footer}
    </section>
  );
}
