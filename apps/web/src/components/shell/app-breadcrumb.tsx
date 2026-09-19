"use client";

import Link from "next/link";
import { DirIcon } from "@/components/dir-icon";
import { t } from "@/lib/i18n";

export type BreadcrumbCrumb = {
  label: string;
  href?: string;
};

export function AppBreadcrumb({ items }: { items: BreadcrumbCrumb[] }) {
  if (items.length === 0) return null;

  return (
    <nav className="shell-breadcrumb" aria-label={t("shell.breadcrumb")}>
      <ol className="shell-breadcrumb__list">
        {items.map((item, index) => {
          const last = index === items.length - 1;
          return (
            <li key={`${item.label}-${index}`} className="shell-breadcrumb__item">
              {index > 0 ? (
                <span className="shell-breadcrumb__sep">
                  {/* Authored LTR (›); DirIcon mirrors to ‹ in RTL (dong-50 #20). */}
                  <DirIcon>›</DirIcon>
                </span>
              ) : null}
              {last || !item.href ? (
                <span aria-current={last ? "page" : undefined}>{item.label}</span>
              ) : (
                <Link href={item.href}>{item.label}</Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
