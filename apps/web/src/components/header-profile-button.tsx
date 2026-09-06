"use client";

import Link from "next/link";
import { hubPathFor } from "@/lib/hub-links";
import { useAppChrome } from "@/lib/use-app-chrome";

/** Header profile control — gold monogram + account identity. */
export function HeaderProfileButton() {
  const chrome = useAppChrome();
  const name = chrome.userName?.trim() || "پروفایل";
  const initial = name.slice(0, 1) || "ک";
  const online = chrome.ready && !chrome.error;

  return (
    <Link
      href={hubPathFor("/profile")}
      className={`header-profile${online ? " is-online" : ""}`}
      title="پروفایل کاربری"
      aria-label={`پروفایل ${name}`}
    >
      <span className="header-profile__orb" aria-hidden>
        <span className="header-profile__halo" />
        <span className="header-profile__ring" />
        <span className="header-profile__initial">{initial}</span>
        <span className="header-profile__pulse" />
      </span>
      <span className="header-profile__meta">
        <small>حساب من</small>
        <b>{name}</b>
      </span>
      <span className="header-profile__chev" aria-hidden>
        ‹
      </span>
    </Link>
  );
}
