"use client";

import { usePathname } from "next/navigation";
import { ContextualMosaicHub } from "@/components/shell/contextual-mosaic-hub";
import { ShellIconSvg } from "@/components/shell/shell-icons";
import { useAppChrome } from "@/lib/use-app-chrome";
import {
  contextualAccountNav,
  contextualMosaicSections,
} from "@/lib/navigation-v2";
import { NAV_LABELS } from "@/lib/nav-labels";
import { slugFromPathname } from "@/lib/workspace-storage";

/** Mosaic-style tool launcher — replaces the dense desktop sidebar list. */
export function ShellToolsView() {
  const chrome = useAppChrome();
  const pathname = usePathname();
  const active = chrome.workspaces.find((w) => w.id === chrome.workspaceId);
  const slug = slugFromPathname(pathname) ?? active?.slug ?? null;
  const sections = contextualMosaicSections(
    active?.template,
    slug,
    chrome.capabilities?.productFlags,
    "all",
  );
  const accountItems = contextualAccountNav();

  return (
    <div className="shell-tools">
      <header className="shell-tools__intro">
        <h1>{NAV_LABELS.more}</h1>
        <p>ابزارهای این فضا و حساب — به‌جای منوی شلوغ کناری.</p>
      </header>

      <ContextualMosaicHub
        sections={sections}
        title="ابزارهای عملیاتی"
        description="تمام مقصدهای قابل استفاده این فضا، فیلترشده با الگو و قابلیت‌های runtime."
        headingId="workspace-tools-title"
        compact
      />

      <ContextualMosaicHub
        sections={[
          {
            key: "account",
            label: NAV_LABELS.sectionAccount,
            items: accountItems,
          },
        ]}
        title={NAV_LABELS.sectionAccount}
        description="حساب، امنیت و تغییرات محصول خارج از محدوده فضای کاری."
        headingId="account-tools-title"
        compact
      />

      <section className="shell-tools__section" aria-labelledby="tools-support">
        <h2 id="tools-support" className="shell-tools__heading">پشتیبانی</h2>
        <ul className="shell-tools__grid">
          <li className="shell-tools__cell">
            <a
              href="mailto:support@dang.local?subject=بازخورد%20دنگ"
              className="shell-tools__tile"
            >
              <span className="shell-tools__tile-icon" aria-hidden>
                <ShellIconSvg name="receipt" />
              </span>
              <span className="shell-tools__tile-label">گزارش مشکل</span>
            </a>
          </li>
        </ul>
      </section>
    </div>
  );
}
