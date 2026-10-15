"use client";

import { useEffect, useId, useRef, useState, useTransition, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { SHELL_APPEARANCE_DIALOG_ID } from "@/components/theme-toggle";
import { useShellV2Api } from "@/components/shell/shell-v2-context";
import { api, clearClientSession } from "@/lib/api";
import { useAppChrome } from "@/lib/use-app-chrome";

/** Avatar menu: notice, account, appearance, and logout. */
export function HeaderProfileButton({ notice = null }: { notice?: ReactNode }) {
  const chrome = useAppChrome();
  const shell = useShellV2Api();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
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

  function onLogout() {
    setOpen(false);
    startTransition(() => {
      void (async () => {
        await api.logout();
        clearClientSession();
        router.push("/login");
      })();
    });
  }

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
          <Link href="/account" className="header-profileMenu__item" onClick={() => setOpen(false)}>
            حساب من
          </Link>
          <button
            type="button"
            className="header-profileMenu__item"
            aria-haspopup="dialog"
            aria-controls={SHELL_APPEARANCE_DIALOG_ID}
            onClick={() => {
              setOpen(false);
              shell?.setAppearanceOpen(true);
            }}
          >
            ظاهر
          </button>
          <button
            type="button"
            className="header-profileMenu__item"
            onClick={onLogout}
            disabled={pending}
          >
            خروج از حساب
          </button>
        </div>
      ) : null}
    </div>
  );
}
