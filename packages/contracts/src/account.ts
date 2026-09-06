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
