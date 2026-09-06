export type AuthMode = "oidc" | "dev" | "password";

export type UserProfile = {
  userId: string;
  email?: string;
  emailVerified: boolean;
  displayName: string;
  avatarUrl?: string;
  locale: string;
  timezone: string;
  authMode: AuthMode;
  hasPassword: boolean;
  /** True when TOTP is confirmed (totp_enabled_at set). */
  mfaEnabled: boolean;
  /**
   * True when the user holds Owner/Admin/Finance in any workspace and MFA is not enabled.
   * Session is still issued; UI may prompt enrollment. Sensitive-op blocking can follow.
   */
  mfaEnrollmentRequired?: boolean;
  createdAt: string;
};

export type RegisterRequest = {
  email: string;
  password: string;
  displayName: string;
};

export type LoginRequest = {
  email: string;
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

export type UpdateProfileRequest = {
  displayName?: string;
  locale?: string;
  timezone?: string;
  avatarUrl?: string | null;
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
