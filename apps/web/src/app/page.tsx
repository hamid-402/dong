import type { Metadata } from "next";
import { ROOT_SITE_METADATA } from "@/lib/site-meta";
import { MarketingLandingPage } from "@/components/site/marketing-landing";

export const metadata: Metadata = ROOT_SITE_METADATA;

/**
 * Public marketing home — always the site front door.
 * Workspace entry is explicit via «ورود به فضای کاری» / ثبت‌نام, not an auto-jump to /login.
 */
export default function RootPage() {
  return <MarketingLandingPage />;
}
