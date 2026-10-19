"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import Link from "next/link";
import type { NavItemV2, NavSectionV2 } from "@/lib/navigation-v2";
import { spaceNavItemHint } from "@/lib/navigation-v2";
import { useBodyScrollLock } from "@/lib/use-body-scroll-lock";

const FOCUSABLE_ITEM = "[data-section-more-item]";

type SpaceSectionMoreMenuProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sections: NavSectionV2[];
  triggerLabel: string;
  triggerHighlighted: boolean;
  /** Desktop dropdown vs mobile bottom sheet. */
  presentation: "dropdown" | "sheet";
  isHrefActive?: (href: string) => boolean;
  /** Mobile trigger prefix, e.g. «بخش: …». */
  triggerClassName?: string;
  ariaLabel?: string;
};

export function SpaceSectionMoreMenu({
  open,
  onOpenChange,
  sections,
  triggerLabel,
  triggerHighlighted,
  presentation,
  isHrefActive,
  triggerClassName,
  ariaLabel,
}: SpaceSectionMoreMenuProps) {
  const panelId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [moreBelow, setMoreBelow] = useState(false);

  const close = useCallback(() => onOpenChange(false), [onOpenChange]);
  useBodyScrollLock(open && presentation === "sheet");

  const updateMoreBelow = useCallback(() => {
    const el = panelRef.current;
    if (!el) {
      setMoreBelow(false);
      return;
    }
    setMoreBelow(el.scrollTop + el.clientHeight < el.scrollHeight - 2);
  }, []);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
        triggerRef.current?.focus();
      }
    }
    function onPointer(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) close();
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onPointer);
    };
  }, [open, close]);

  useEffect(() => {
    if (!open) return;
    const first = panelRef.current?.querySelector<HTMLElement>(FOCUSABLE_ITEM);
    first?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) {
      setMoreBelow(false);
      return;
    }
    const el = panelRef.current;
    if (!el) return;
    updateMoreBelow();
    el.addEventListener("scroll", updateMoreBelow, { passive: true });
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(updateMoreBelow) : null;
    ro?.observe(el);
    return () => {
      el.removeEventListener("scroll", updateMoreBelow);
      ro?.disconnect();
    };
  }, [open, sections, updateMoreBelow]);

  function items(): HTMLElement[] {
    return Array.from(
      panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE_ITEM) ?? [],
    );
  }

  function onPanelKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (
      event.key !== "ArrowDown" &&
      event.key !== "ArrowUp" &&
      event.key !== "Home" &&
      event.key !== "End"
    ) {
      return;
    }
    const list = items();
    if (list.length === 0) return;
    event.preventDefault();
    if (event.key === "Home") {
      list[0]?.focus();
      return;
    }
    if (event.key === "End") {
      list.at(-1)?.focus();
      return;
    }
    const current = list.indexOf(document.activeElement as HTMLElement);
    const delta = event.key === "ArrowDown" ? 1 : -1;
    if (current < 0) {
      (event.key === "ArrowUp" ? list.at(-1) : list[0])?.focus();
      return;
    }
    list[(current + delta + list.length) % list.length]?.focus();
  }

  const hasItems = sections.some((s) => s.items.length > 0);
  if (!hasItems) return null;

  return (
    <div
      className={`shell-sectionMore${presentation === "sheet" ? " shell-sectionMore--sheet" : ""}`}
      ref={rootRef}
    >
      <button
        ref={triggerRef}
        type="button"
        className={[
          "shell-sectionTabs__tab",
          "shell-sectionTabs__tab--more",
          triggerHighlighted ? "is-active" : "",
          open ? "is-open" : "",
          triggerClassName ?? "",
        ]
          .filter(Boolean)
          .join(" ")}
        aria-expanded={open}
        aria-controls={panelId}
        aria-haspopup="menu"
        aria-current={triggerHighlighted ? "true" : undefined}
        aria-label={ariaLabel ?? triggerLabel}
        onClick={() => onOpenChange(!open)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" && !open) {
            event.preventDefault();
            onOpenChange(true);
          }
        }}
      >
        <span>{triggerLabel}</span>
        <span className="shell-sectionMore__caret" aria-hidden="true">
          ▾
        </span>
      </button>
      {open ? (
        <>
          {presentation === "sheet" ? (
            <button
              type="button"
              className="shell-sectionMore__backdrop"
              aria-label="بستن"
              tabIndex={-1}
              onClick={close}
            />
          ) : null}
          <div
            ref={panelRef}
            id={panelId}
            className={`shell-sectionMore__panel${
              presentation === "sheet" ? " shell-sectionMore__panel--sheet" : ""
            }${moreBelow ? " has-more-below" : ""}`}
            role="menu"
            aria-label="بخش‌های بیشتر"
            onKeyDown={onPanelKeyDown}
          >
            {sections.map((section) => (
              <div
                key={section.key}
                className="shell-sectionMore__group"
                role="group"
                aria-label={section.label}
              >
                <p className="shell-sectionMore__groupLabel">{section.label}</p>
                {section.items.map((item) => (
                  <MoreItemLink
                    key={item.key}
                    item={item}
                    active={isHrefActive?.(item.href) ?? false}
                    onNavigate={close}
                  />
                ))}
              </div>
            ))}
            {moreBelow ? (
              <p className="shell-sectionMore__scrollHint" aria-hidden="true">
                بیشتر ↓
              </p>
            ) : null}
          </div>
        </>
      ) : null}
    </div>
  );
}

function MoreItemLink({
  item,
  active,
  onNavigate,
}: {
  item: NavItemV2;
  active: boolean;
  onNavigate: () => void;
}) {
  const hint = spaceNavItemHint(item.key);
  return (
    <Link
      href={item.href}
      role="menuitem"
      data-section-more-item=""
      className={`shell-sectionMore__item${active ? " is-active" : ""}`}
      aria-current={active ? "page" : undefined}
      title={hint && hint !== item.label ? hint : undefined}
      onClick={onNavigate}
    >
      {item.label}
    </Link>
  );
}
