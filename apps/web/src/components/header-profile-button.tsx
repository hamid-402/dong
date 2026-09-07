"use client";

import Link from "next/link";
import { useAppChrome } from "@/lib/use-app-chrome";

/** Header avatar — حساب از پروفایل؛ ابزارها از تب «بیشتر». */
export function HeaderProfileButton() {
  const chrome = useAppChrome();
  const name = chrome.userName?.trim() || "پروفایل";
  const initial = name.slice(0, 1) || "ک";
  const online = chrome.ready && !chrome.error;

  return (
    <Link
      href="/account"
      className={`header-profile${online ? " is-online" : ""}`}
      title={name}
      aria-label={`پروفایل ${name}`}
    >
      <span className="header-profile__orb" aria-hidden>
        <span className="header-profile__halo" />
        <span className="header-profile__ring" />
        <span className="header-profile__initial">{initial}</span>
        <span className="header-profile__pulse" />
      </span>
      <span className="header-profile__meta">
        <b>{name}</b>
      </span>
    </Link>
  );
}
