"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { MembershipRole, WorkspaceTemplate } from "@dang/contracts";
import { ShellIconSvg } from "@/components/shell/shell-icons";
import { isNavHrefActive, spaceNav, spaceNavItemHint, type SpaceNavFlags } from "@/lib/navigation-v2";
import { NAV_LABELS } from "@/lib/nav-labels";
import { t } from "@/lib/i18n";
import { wPath } from "@/lib/workspace-paths";

/**
 * Workspace module menu — opens from the header (before trail/back).
 * Replaces the fixed side rail so the canvas stays wide.
 */
export function ShellWorkspaceNavMenu({
  template,
  slug,
  flags,
  role,
  triggerLabel = "منو",
  leaveHref,
  activeDomain,
}: {
  template: WorkspaceTemplate | undefined;
  slug: string;
  flags?: SpaceNavFlags;
  role?: MembershipRole | null;
  /** Current domain when inside a page; «منو» on the space home. */
  triggerLabel?: string;
  /** Membership leave lives here, aimed at the settings danger zone. */
  leaveHref?: string | null;
  /** Highlights that domain. Other domains stay in the menu. */
  activeDomain?: string | null;
}) {
  const pathname = usePathname();
  const panelId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);

  const sections = spaceNav(template, slug, flags, role);
  const spaceHref = wPath(slug);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    function onPointer(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onPointer);
    };
  }, [open]);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <div className="shell-navMenu" ref={rootRef}>
      <button
        type="button"
        className={`shell-navMenu__trigger${open ? " is-open" : ""}`}
        aria-expanded={open}
        aria-controls={panelId}
        aria-haspopup="menu"
        onClick={() => setOpen((v) => !v)}
        title={triggerLabel}
        aria-label={triggerLabel === "منو" ? "منوی فضای کاری" : triggerLabel}
      >
        <ShellIconSvg name="menu" />
        <span className="shell-navMenu__triggerLabel">{triggerLabel}</span>
      </button>
      {open ? (
        <div
          id={panelId}
          className="shell-navMenu__panel"
          role="menu"
          aria-label="میانبرهای فضای کاری"
        >
          <Link
            href={spaceHref}
            role="menuitem"
            className={`shell-navMenu__item${isNavHrefActive(pathname, spaceHref) ? " is-active" : ""}`}
            onClick={() => setOpen(false)}
          >
            <ShellIconSvg name="home" />
            <span>{NAV_LABELS.space}</span>
          </Link>
          {sections.map((section) => (
            <div
              key={section.key}
              className={`shell-navMenu__section${section.key === activeDomain ? " is-current" : ""}`}
              role="group"
              aria-label={section.label}
              aria-current={section.key === activeDomain ? "true" : undefined}
            >
              <p className="shell-navMenu__sectionLabel">{section.label}</p>
              {section.items.map((item) => (
                <Link
                  key={item.key}
                  href={item.href}
                  role="menuitem"
                  className={`shell-navMenu__item${isNavHrefActive(pathname, item.href) ? " is-active" : ""}`}
                  onClick={() => setOpen(false)}
                >
                  <ShellIconSvg name={item.icon} />
                  <span className="shell-navMenu__itemText">
                    <span>{item.label}</span>
                    {spaceNavItemHint(item.key) ? (
                      <span className="shell-navMenu__itemHint">{spaceNavItemHint(item.key)}</span>
                    ) : null}
                  </span>
                </Link>
              ))}
            </div>
          ))}
          {leaveHref ? (
            <div className="shell-navMenu__leave">
              <Link
                href={leaveHref}
                role="menuitem"
                className="shell-navMenu__item shell-navMenu__leaveLink"
                onClick={() => setOpen(false)}
              >
                <span>{t("shell.leaveSpace")}</span>
              </Link>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/** @deprecated Prefer ShellWorkspaceNavMenu in the header. */
export { ShellWorkspaceNavMenu as ShellSecondaryRail };
