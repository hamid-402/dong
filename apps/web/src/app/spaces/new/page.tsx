"use client";

import { Suspense } from "react";
import { OnboardingView } from "@/components/views/onboarding-view";

export default function SpacesNewPage() {
  return (
    <Suspense fallback={<p className="liveHint">در حال بارگذاری…</p>}>
      <OnboardingView />
    </Suspense>
  );
}
