"use client";

import type { ReactNode } from "react";

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
}: {
  title: string;
  badge?: ReactNode;
  children: ReactNode;
  delayClass?: string;
  className?: string;
}) {
  return (
    <section className={`sectionCard card animated ${delayClass ?? ""} ${className}`.trim()}>
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

export function StatusPill({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "ok" | "warn" | "danger" | "gold" }) {
  return <span className={`statusPill tone-${tone}`}>{children}</span>;
}

export function EmptyHint({ children }: { children: ReactNode }) {
  return <p className="emptyHint">{children}</p>;
}

export function FormStack({ children }: { children: ReactNode }) {
  return <div className="formStack">{children}</div>;
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
      <span>{label}</span>
      <strong>{amount}</strong>
      <p>{subtitle}</p>
      <div>
        <button type="button" onClick={onAction}>
          {actionLabel}
        </button>
        {hint ? <small>{hint}</small> : null}
      </div>
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
      <span className="actionIcon">{icon ?? "←"}</span>
      <span>
        <b>{title}</b>
        <small>{description}</small>
      </span>
      <i>←</i>
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
