"use client";

import { ClassicToHubRedirect } from "@/components/mosaic/classic-to-hub-redirect";

/** Classic `/group` → canonical `/w/[slug]`. */
export default function GroupRedirect() {
  return <ClassicToHubRedirect />;
}
