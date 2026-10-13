"use client";

import { Suspense } from "react";
import { RegisterView } from "@/components/views/register-view";

function RegisterFallback() {
  return (
    <div className="authGate">
      <main id="main" className="authGate__main" tabIndex={-1}>
        <p role="status">در حال بارگذاری…</p>
      </main>
    </div>
  );
}

export default function RegisterPage() {
  return (
    <Suspense fallback={<RegisterFallback />}>
      <RegisterView />
    </Suspense>
  );
}
