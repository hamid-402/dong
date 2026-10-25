"use client";

import { Suspense } from "react";
import { ContentSkeleton } from "@/components/shell/content-skeleton";
import { OnboardingView } from "@/components/views/onboarding-view";

export default function SpacesNewPage() {
  return (
    <Suspense fallback={<ContentSkeleton rows={4} label="در حال بارگذاری ساخت فضا…" />}>
      <OnboardingView />
    </Suspense>
  );
}
