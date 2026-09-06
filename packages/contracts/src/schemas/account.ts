import { z } from "zod";

const emailSchema = z.string().trim().email().max(320);
const passwordSchema = z.string().min(8).max(128);
const displayNameSchema = z.string().trim().min(1).max(120);

export const registerRequestSchema = z
  .object({
    email: emailSchema,
    password: passwordSchema,
    displayName: displayNameSchema,
  })
  .strict();

export type RegisterRequestInput = z.infer<typeof registerRequestSchema>;

export const loginRequestSchema = z
  .object({
    email: emailSchema,
    password: z.string().min(1).max(128),
  })
  .strict();

export type LoginRequestInput = z.infer<typeof loginRequestSchema>;

export const forgotPasswordRequestSchema = z
  .object({
    email: emailSchema,
  })
  .strict();

export type ForgotPasswordRequestInput = z.infer<typeof forgotPasswordRequestSchema>;

export const resetPasswordRequestSchema = z
  .object({
    token: z.string().trim().min(1).max(512),
    password: passwordSchema,
  })
  .strict();

export type ResetPasswordRequestInput = z.infer<typeof resetPasswordRequestSchema>;

export const changePasswordRequestSchema = z
  .object({
    currentPassword: z.string().min(1).max(128),
    newPassword: passwordSchema,
  })
  .strict();

export type ChangePasswordRequestInput = z.infer<typeof changePasswordRequestSchema>;

export const updateProfileRequestSchema = z
  .object({
    displayName: displayNameSchema.optional(),
    locale: z.string().trim().min(2).max(32).optional(),
    timezone: z.string().trim().min(1).max(64).optional(),
    avatarUrl: z.string().trim().max(2048).nullable().optional(),
  })
  .strict();

export type UpdateProfileRequestInput = z.infer<typeof updateProfileRequestSchema>;

export const verifyEmailRequestSchema = z
  .object({
    token: z.string().trim().min(1).max(512),
  })
  .strict();

export type VerifyEmailRequestInput = z.infer<typeof verifyEmailRequestSchema>;

const totpCodeSchema = z
  .string()
  .trim()
  .regex(/^\d{6}$/, "TOTP code must be 6 digits");

export const mfaConfirmRequestSchema = z
  .object({
    code: totpCodeSchema,
  })
  .strict();

export type MfaConfirmRequestInput = z.infer<typeof mfaConfirmRequestSchema>;

export const mfaVerifyRequestSchema = z
  .object({
    challengeId: z.string().trim().min(1).max(512),
    code: totpCodeSchema.optional(),
    recoveryCode: z.string().trim().min(8).max(64).optional(),
  })
  .strict()
  .refine(
    (v) =>
      (v.code !== undefined && v.recoveryCode === undefined) ||
      (v.code === undefined && v.recoveryCode !== undefined),
    { message: "Provide either code or recoveryCode" },
  );

export type MfaVerifyRequestInput = z.infer<typeof mfaVerifyRequestSchema>;

export const mfaDisableRequestSchema = z
  .object({
    password: z.string().min(1).max(128),
    code: totpCodeSchema,
  })
  .strict();

export type MfaDisableRequestInput = z.infer<typeof mfaDisableRequestSchema>;
