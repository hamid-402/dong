import { newClientId } from "@/lib/id";
import type {
  AuthActionResponse,
  AuthMeResponse,
  ChangePasswordRequest,
  ForgotPasswordResponse,
  LoginRequest,
  LoginResponse,
  MfaConfirmRequest,
  MfaConfirmResponse,
  MfaDisableRequest,
  MfaSetupResponse,
  MfaVerifyRequest,
  RegisterRequest,
  SessionSummary,
  UpdateProfileRequest,
  UserProfile,
} from "@dang/contracts";

export const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "/api/v1";

export type AuditEventDto = {
  id: string;
  workspaceId: string;
  actorUserId?: string;
  action: string;
  targetType: string;
  targetId?: string;
  result: "success" | "failure" | "denied";
  reason?: string;
  requestId?: string;
  occurredAt: string;
  metadata?: Record<string, string | number | boolean | null>;
};

const DEV_SUBJECT_KEY = "dang.dev.subject";
const DEV_NAME_KEY = "dang.dev.displayName";
const AUTH_MODE_KEY = "dang.auth.mode";
const WEB_SESSION_COOKIE = "dang_web_session";
const WEB_SESSION_MAX_AGE_SEC = 14 * 24 * 60 * 60;

export type AuthClientMode = "dev" | "password" | "oidc";

export function getAuthClientMode(): AuthClientMode {
  if (typeof window === "undefined") return "dev";
  const mode = window.localStorage.getItem(AUTH_MODE_KEY);
  if (mode === "password" || mode === "oidc") return mode;
  return "dev";
}

export function markClientSession(mode: AuthClientMode = "password") {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(AUTH_MODE_KEY, mode);
  document.cookie = `${WEB_SESSION_COOKIE}=1; path=/; max-age=${WEB_SESSION_MAX_AGE_SEC}; SameSite=Lax`;
}

export function clearClientSession() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(AUTH_MODE_KEY);
  document.cookie = `${WEB_SESSION_COOKIE}=; path=/; max-age=0; SameSite=Lax`;
}

/** Fetch Headers reject non-ISO-8859-1; encode Unicode for transport. */
export function encodeDevHeader(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  if (typeof btoa !== "function") {
    throw new Error("base64 encoding unavailable in this browser");
  }
  return `b64:${btoa(binary)}`;
}

export function getDevIdentity() {
  if (typeof window === "undefined") {
    return { subject: "dev-local-user", displayName: "کاربر محلی" };
  }
  return {
    subject: window.localStorage.getItem(DEV_SUBJECT_KEY) ?? "dev-local-user",
    displayName: window.localStorage.getItem(DEV_NAME_KEY) ?? "کاربر محلی",
  };
}

/** Stable defaults for useState initializers (avoid SSR/localStorage mismatch). */
export const DEV_IDENTITY_DEFAULTS: { subject: string; displayName: string } = {
  subject: "dev-local-user",
  displayName: "کاربر محلی",
};

export function setDevIdentity(subject: string, displayName: string) {
  window.localStorage.setItem(DEV_SUBJECT_KEY, subject);
  window.localStorage.setItem(DEV_NAME_KEY, displayName);
}

export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export async function apiFetch<T>(
  path: string,
  init: RequestInit = {},
  idempotencyKey?: string,
): Promise<T> {
  const attempt = async (): Promise<Response> => {
    const headers = new Headers(init.headers);
    headers.set("Accept", "application/json");
    if (getAuthClientMode() === "dev") {
      const identity = getDevIdentity();
      headers.set("x-dang-subject", encodeDevHeader(identity.subject));
      headers.set("x-dang-display-name", encodeDevHeader(identity.displayName));
    }
    if (!headers.has("x-request-id")) {
      headers.set("x-request-id", newClientId());
    }
    if (idempotencyKey) {
      headers.set("idempotency-key", idempotencyKey);
    }
    if (init.body && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }

    return fetch(`${API_BASE}${path}`, {
      ...init,
      headers,
      credentials: "include",
    });
  };

  // One retry on transient proxy/API blips (common on LAN / cold start).
  let response = await attempt();
  if (response.status === 503) {
    await new Promise((r) => setTimeout(r, 350));
    response = await attempt();
  }

  if (!response.ok) {
    const detail = await response.text();
    let message = detail || `API ${response.status}`;
    try {
      const parsed = JSON.parse(detail) as { detail?: string; title?: string };
      if (typeof parsed.detail === "string" && parsed.detail.trim()) {
        message = parsed.detail;
      } else if (typeof parsed.title === "string" && parsed.title.trim()) {
        message = parsed.title;
      }
    } catch {
      /* plain-text error body */
    }
    if (response.status === 503) {
      message =
        /API|3006|dev:api|unreachable/i.test(message)
          ? message
          : "سرویس API در دسترس نیست. ترمینال: pnpm dev:api";
    }
    throw new ApiError(message, response.status);
  }

  if (response.status === 204) {
    return undefined as T;
  }
  const text = await response.text();
  if (!text.trim()) {
    return undefined as T;
  }
  return JSON.parse(text) as T;
}

/** Auth endpoints — first slice of the api.ts domain split. */
export const authApi = {
  me: () => apiFetch<AuthMeResponse>("/auth/me"),
  session: () => apiFetch<SessionSummary>("/auth/session"),
  register: (body: RegisterRequest) =>
    apiFetch<AuthActionResponse>("/auth/register", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  login: (body: LoginRequest) =>
    apiFetch<LoginResponse>("/auth/login", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  mfaVerify: (body: MfaVerifyRequest) =>
    apiFetch<AuthActionResponse>("/auth/mfa/verify", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  mfaSetup: () =>
    apiFetch<MfaSetupResponse>("/auth/mfa/setup", {
      method: "POST",
      body: "{}",
    }),
  mfaConfirm: (body: MfaConfirmRequest) =>
    apiFetch<MfaConfirmResponse>("/auth/mfa/confirm", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  mfaDisable: (body: MfaDisableRequest) =>
    apiFetch<{ ok: true }>("/auth/mfa/disable", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  logout: () =>
    apiFetch<{ ok: true }>("/auth/logout", { method: "POST", body: "{}" }),
  forgotPassword: (email: string) =>
    apiFetch<ForgotPasswordResponse>("/auth/forgot-password", {
      method: "POST",
      body: JSON.stringify({ email }),
    }),
  resetPassword: (token: string, password: string) =>
    apiFetch<AuthActionResponse>("/auth/reset-password", {
      method: "POST",
      body: JSON.stringify({ token, password }),
    }),
  revokeSessions: () =>
    apiFetch<{ ok: true }>("/auth/revoke-sessions", {
      method: "POST",
      body: "{}",
    }),
  profile: () => apiFetch<UserProfile>("/auth/profile"),
  updateProfile: (body: UpdateProfileRequest) =>
    apiFetch<UserProfile>("/auth/profile", {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  changePassword: (body: ChangePasswordRequest) =>
    apiFetch<{ ok: true }>("/auth/change-password", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  verifyEmail: (token: string) =>
    apiFetch<UserProfile>("/auth/verify-email", {
      method: "POST",
      body: JSON.stringify({ token }),
    }),
  resendVerification: () =>
    apiFetch<{ ok: true; debugVerifyUrl?: string }>("/auth/resend-verification", {
      method: "POST",
      body: "{}",
    }),
  oidcStatus: () =>
    apiFetch<{ configured: boolean; allowDevAuth: boolean }>("/auth/oidc/status"),
  oidcLoginUrl: () => `${API_BASE.replace(/\/$/, "")}/auth/oidc/login`,
};
