"use client";

import { Suspense } from "react";
import { LoginView } from "@/components/views/login-view";

function LoginFallback() {
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

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginFallback />}>
      <LoginView />
    </Suspense>
  );
}
