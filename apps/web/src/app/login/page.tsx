import { Suspense } from "react";
import { AuthGateHeader } from "@/components/auth-shell";
import { LoginView } from "@/components/views/login-view";

export default function LoginPage() {
  return (
    <div className="authGate">
      <AuthGateHeader />
      <main id="main" className="authGate__main" tabIndex={-1}>
        <h1>ورود به حساب</h1>
        <Suspense fallback={<p role="status">در حال بارگذاری…</p>}>
          <LoginView />
        </Suspense>
      </main>
    </div>
  );
}
