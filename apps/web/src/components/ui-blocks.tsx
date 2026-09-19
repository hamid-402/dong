"use client";

import type { ReactNode } from "react";
import { StickerSvg, type StickerName } from "@/components/visual/stickers";
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

  /* Shell v2: keep real page heading; only trim duplicate chrome affordances via CSS if needed. */
  if (embedded) {
    return (
      <div className="moduleChrome">
        <span className="eyebrow">{eyebrow}</span>
        <h1 className="moduleChrome__title">{title}</h1>
        {description ? <p className="moduleChrome__desc">{description}</p> : null}
        {actions ? <div className="productHeaderActions">{actions}</div> : null}
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
  description,
  actions,
  children,
  delayClass,
  className = "",
  tone = "default",
  id,
}: {
  title: string;
  badge?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  delayClass?: string;
  className?: string;
  /** quiet = secondary panels (reports) — lighter visual weight */
  tone?: "default" | "quiet";
  id?: string;
}) {
  return (
    <section
      id={id}
      className={`sectionCard card animated sectionCard--${tone} ${delayClass ?? ""} ${className}`.trim()}
    >
      <div className="sectionCardHead">
        <div className="sectionCardHeadMain">
          <b>{title}</b>
          {description ? <small className="sectionCardDesc">{description}</small> : null}
        </div>
        {badge != null ? <span className="sectionBadge">{badge}</span> : null}
        {actions != null ? <div className="sectionCardActions">{actions}</div> : null}
      </div>
      <div className="sectionCardBody">{children}</div>
    </section>
  );
}

export function DataList({
  children,
  scroll = true,
}: {
  children: ReactNode;
  /** Cap height + local scroll for lists that can grow (expenses, members, queues). */
  scroll?: boolean;
}) {
  return (
    <div className={scroll ? "dataList" : "dataList dataList--flush"}>{children}</div>
  );
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

export function EmptyHint({
  children,
  loading = false,
}: {
  children: ReactNode;
  /** When true, render skeleton instead of empty copy. */
  loading?: boolean;
}) {
  if (loading) {
    return (
      <div className="emptyHint emptyHint--loading" role="status" aria-live="polite" aria-busy="true">
        <span className="visually-hidden">در حال بارگذاری…</span>
        <span className="emptyHint__skeleton" aria-hidden />
        <span className="emptyHint__skeleton emptyHint__skeleton--short" aria-hidden />
      </div>
    );
  }
  return <p className="emptyHint">{children}</p>;
}

export function EmptyStateBlock({
  title,
  description,
  action,
  illustration,
  sticker = "spark",
}: {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  /** Optional visual accent (e.g. EmptyStateIllustration) — never used for loading. */
  illustration?: ReactNode;
  /** Built-in SVG sticker when illustration is omitted; null disables. */
  sticker?: StickerName | null;
}) {
  const art =
    illustration ?? (sticker ? <StickerSvg name={sticker} /> : null);
  return (
    <div className="emptyStateBlock" role="status">
      {art ? <div className="emptyStateBlock__art">{art}</div> : null}
      <strong>{title}</strong>
      {description ? <p>{description}</p> : null}
      {action ? <div className="emptyStateBlock__action">{action}</div> : null}
    </div>
  );
}

/** Short live status line — not a dashed empty state. */
export function StatusLine({ children }: { children: ReactNode }) {
  return <p className="statusLine">{children}</p>;
}

export function FormStack({
  children,
  density = "default",
  className,
}: {
  children: ReactNode;
  density?: "default" | "compact" | "inline";
  className?: string;
}) {
  return (
    <div className={`formStack formStack--${density}${className ? ` ${className}` : ""}`}>
      {children}
    </div>
  );
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
  collapsible = false,
  defaultOpen = true,
}: {
  title: string;
  badge?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  delayClass?: string;
  /** Expand/collapse long panels with an internal scroll body. */
  collapsible?: boolean;
  defaultOpen?: boolean;
}) {
  if (collapsible) {
    return (
      <details
        className={`panel card animated scrollDisclosure ${delayClass ?? ""}`.trim()}
        open={defaultOpen}
      >
        <summary className="panelHeader">
          <b>{title}</b>
          {badge != null ? <span>{badge}</span> : null}
        </summary>
        <div className="scrollDisclosure__body tasks">{children}</div>
        {footer}
      </details>
    );
  }

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
