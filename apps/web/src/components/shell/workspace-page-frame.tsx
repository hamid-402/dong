"use client";

import type { ReactNode } from "react";
import { StatusLine } from "@/components/ui-blocks";
import { ContentSkeleton } from "@/components/shell/content-skeleton";
import { t } from "@/lib/i18n";

/**
 * IA-UX §5 page anatomy — kicker + title + one-line blurb + one primary CTA,
 * then body states. Path + back live in ShellPageTrail (shell), not here.
 */
export type WorkspacePageFrameState = "ready" | "loading" | "empty" | "error";

export function WorkspacePageFrame({
  title,
  kicker,
  description,
  primaryAction,
  secondaryActions,
  chrome: _chrome,
  state = "ready",
  loadingLabel,
  skeletonRows = 3,
  empty,
  error,
  children,
}: {
  title: string;
  /** Small context above the title (e.g. kind / live status). */
  kicker?: ReactNode;
  description?: string;
  /** Exactly one primary control (Button or Link). First child of actions gets primary styling. */
  primaryAction?: ReactNode;
  secondaryActions?: ReactNode;
  /** @deprecated Sibling ops strip removed from product chrome. Ignored. */
  chrome?: ReactNode;
  state?: WorkspacePageFrameState;
  loadingLabel?: string;
  skeletonRows?: number;
  empty?: ReactNode;
  error?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="workspacePageFrame">
      <header className="moduleChrome">
        <div className="moduleChrome__lead">
          {kicker ? <p className="moduleChrome__kicker">{kicker}</p> : null}
          <h1 className="moduleChrome__title">{title}</h1>
          {description ? <p className="moduleChrome__desc">{description}</p> : null}
        </div>
        {primaryAction != null || secondaryActions != null ? (
          <div className="moduleChrome__actions productHeaderActions">
            {primaryAction}
            {secondaryActions ? (
              <div className="uxSecondaryActions">{secondaryActions}</div>
            ) : null}
          </div>
        ) : null}
      </header>

      {state === "loading" ? (
        <ContentSkeleton rows={skeletonRows} label={loadingLabel ?? t("shell.loading")} />
      ) : null}
      {state === "error"
        ? (error ?? <StatusLine>بارگذاری ناموفق بود. صفحه را تازه‌سازی کنید.</StatusLine>)
        : null}
      {state === "empty" ? empty : null}
      {state === "ready" ? <div className="workspacePageFrame__body">{children}</div> : null}
    </div>
  );
}
