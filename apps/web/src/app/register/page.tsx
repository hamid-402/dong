"use client";

import { Suspense } from "react";
import { RegisterView } from "@/components/views/register-view";

function RegisterFallback() {
  return (
    <div className="authLayout">
      <div className="ambient ambient--rich" aria-hidden />
      <div className="authLayout__main">
        <main
          className="authLayout__panel card animated"
          style={{ width: "min(100% - 32px, 420px)" }}
        >
          <p className="emptyHint" style={{ border: "none", textAlign: "center" }}>
            در حال بارگذاری…
          </p>
        </main>
      </div>
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
