"use client";

import { Suspense } from "react";
import { LoginView } from "@/components/views/login-view";

function LoginFallback() {
  return (
    <div className="authGate">
      <main id="main" className="authGate__main" tabIndex={-1}>
        <p role="status">در حال بارگذاری…</p>
      </main>
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
