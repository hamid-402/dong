"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { ThemeToggleButton } from "@/components/theme-toggle";
import { useAppChrome } from "@/lib/use-app-chrome";

export type HeaderProfileTool = {
  href: string;
  label: string;
};

/** Avatar menu: account, appearance, and the extra tool links. */
export function HeaderProfileButton({
  tools = [],
  notice = null,
}: {
  tools?: readonly HeaderProfileTool[];
  /** Optional live shortcut (approval queue) kept out of the icon bar. */
  notice?: ReactNode;
}) {
  const chrome = useAppChrome();
  const name = chrome.userName?.trim() || "پروفایل";
  const initial = name.slice(0, 1) || "ک";
  const online = chrome.ready && !chrome.error;
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
      }
    };
    window.addEventListener("mousedown", onPointer);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onPointer);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="header-profileMenu" ref={rootRef}>
      <button
        type="button"
        className={`header-profile${online ? " is-online" : ""}`}
        title={name}
        aria-label={`پروفایل ${name}`}
        aria-haspopup="true"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="header-profile__orb" aria-hidden>
          <span className="header-profile__initial">{initial}</span>
        </span>
      </button>
      {open ? (
        <div className="header-profileMenu__panel" id={panelId} aria-label={`پروفایل ${name}`}>
          {notice}
          <Link
            href="/account"
            className="header-profileMenu__item"
            onClick={() => setOpen(false)}
          >
            پروفایل {name}
          </Link>
          <div className="header-profileMenu__theme">
            <ThemeToggleButton />
            <span>ظاهر</span>
          </div>
          {tools.length > 0 ? (
            <div className="header-profileMenu__section" aria-label="ابزارهای دیگر">
              <p className="header-profileMenu__label">ابزارهای دیگر</p>
              {tools.map((tool) => (
                <Link
                  key={tool.href}
                  href={tool.href}
                  className="header-profileMenu__item"
                  onClick={() => setOpen(false)}
                >
                  {tool.label}
                </Link>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
