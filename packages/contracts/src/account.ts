import type { DisplayUnit } from "./money.js";

export type AuthMode = "oidc" | "dev" | "password";

export type PlatformRole = "user" | "platform_support" | "platform_owner";

export type DisplayUnitPreference = DisplayUnit;

export type UserProfile = {
  userId: string;
  email?: string;
  emailVerified: boolean;
  /** Unique handle for search and login (S11-01). Lowercase canonical form. */
  username?: string;
  /** E.164 phone. Stored for contact matching; not proof of ownership. */
  phone?: string;
  /**
   * False until an SMS provider verifies the number. No provider is wired yet,
   * so this stays false — the UI must not claim a verified phone.
   */
  phoneVerified: boolean;
  displayName: string;
  avatarUrl?: string;
  locale: string;
  timezone: string;
  /** Prefer rial/toman in UI; null/undefined = follow workspace default. */
  displayUnit?: DisplayUnitPreference | null;
  platformRole: PlatformRole;
  authMode: AuthMode;
  hasPassword: boolean;
  /** True when TOTP is confirmed (totp_enabled_at set). */
  mfaEnabled: boolean;
  /**
   * True when the user holds Owner/Admin/Finance (or platform_owner/support) and MFA is not enabled.
   * Sensitive API ops hard-block via assertMfaEnrolled*; session is still issued so enrollment UI works.
   */
  mfaEnrollmentRequired?: boolean;
  /** True when legacy accounts still need to pick a username. */
  usernameRequired?: boolean;
  createdAt: string;
};

/** Active account session metadata. Never exposes the bearer token or its hash. */
export type AccountSessionSummary = {
  id: string;
  current: boolean;
  ip?: string;
  userAgent?: string;
  createdAt: string;
  expiresAt: string;
};

/** GDPR-like self-service data package (R10-14). No secrets/hashes. */
export type AccountDataExport = {
  exportedAt: string;
  schemaVersion: 1;
  profile: UserProfile;
  workspaces: Array<{
    id: string;
    name: string;
    slug: string;
    template: string;
  }>;
  sessions: AccountSessionSummary[];
  notes: string[];
};

export type DeleteAccountRequest = {
  /** Required when the account has a password. */
  password?: string;
  /** Must be exactly DELETE */
  confirm: "DELETE";
};

export type DeleteAccountResponse = {
  ok: true;
  anonymized: true;
};

export type RegisterRequest = {
  email: string;
  password: string;
  displayName: string;
  /** Required from S11-01 so people can find each other. */
  username: string;
  /** Optional; normalized to E.164 when present. */
  phone?: string;
};

export type LoginRequest = {
  /** Legacy field — still accepted. Prefer `identifier`. */
  email?: string;
  /** Email, username, or phone number. */
  identifier?: string;
  password: string;
};

export type ForgotPasswordRequest = {
  email: string;
};

export type ResetPasswordRequest = {
  token: string;
  password: string;
};

export type ChangePasswordRequest = {
  currentPassword: string;
  newPassword: string;
};

/** Step-up reauth (password) before export / vault / high-risk privacy ops. */
export type ReauthRequest = {
  password: string;
};

export type ReauthResponse = {
  ok: true;
  /** Seconds until dang_reauth cookie expires. */
  expiresInSec: number;
};

export type UpdateProfileRequest = {
  displayName?: string;
  locale?: string;
  timezone?: string;
  avatarUrl?: string | null;
  /** Change handle; must stay unique. */
  username?: string;
  /** Set or clear the phone number (null clears it). */
  phone?: string | null;
  /** Prefer rial/toman; null clears to workspace default. */
  displayUnit?: DisplayUnitPreference | null;
};

/** Email change requires the current password and re-verification (S11-01). */
export type ChangeEmailRequest = {
  newEmail: string;
  currentPassword: string;
};

export type ChangeEmailResponse = {
  ok: true;
  profile: UserProfile;
  /** Present only in development when email delivery is not configured. */
  debugVerifyUrl?: string;
};

export type ClaimUsernameRequest = {
  username: string;
};

export type UsernameAvailableResponse = {
  username: string;
  available: boolean;
};

export type AuthActionResponse = {
  ok: true;
  profile: UserProfile;
  actor: {
    userId: string;
    externalSubject: string;
    displayName: string;
    authMode: AuthMode;
  };
  /** Present only in development when email is not configured. */
  debugResetUrl?: string;
  debugVerifyUrl?: string;
};

/** Returned from login when MFA is enabled — no session cookie yet. */
export type MfaChallengeResponse = {
  mfaRequired: true;
  challengeId: string;
};

export type LoginResponse = AuthActionResponse | MfaChallengeResponse;

export type MfaSetupResponse = {
  secret: string;
  otpauthUrl: string;
  /** Plaintext recovery codes shown once; hashed at rest. */
  recoveryCodes: string[];
};

export type MfaConfirmRequest = {
  code: string;
};

export type MfaConfirmResponse = {
  ok: true;
  profile: UserProfile;
};

export type MfaVerifyRequest = {
  challengeId: string;
  code?: string;
  recoveryCode?: string;
};

export type MfaDisableRequest = {
  password: string;
  code: string;
};

export type ForgotPasswordResponse = {
  ok: true;
  /** Anti-enumeration: always true; reset link only in allowDevAuth. */
  debugResetUrl?: string;
};

export type VerifyEmailRequest = {
  token: string;
};

export type ResendVerificationResponse = {
  ok: true;
  debugVerifyUrl?: string;
};
