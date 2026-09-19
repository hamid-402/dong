import { z } from "zod";
import {
  USERNAME_MAX_LENGTH,
  USERNAME_MIN_LENGTH,
  isValidPhone,
  isValidUsername,
} from "../identity.js";

const emailSchema = z.string().trim().email().max(320);
const passwordSchema = z.string().min(8).max(128);
const displayNameSchema = z.string().trim().min(1).max(120);

const usernameSchema = z
  .string()
  .trim()
  .min(USERNAME_MIN_LENGTH)
  .max(USERNAME_MAX_LENGTH)
  .refine(isValidUsername, {
    message: "username must start with a letter and use a-z, 0-9, dot, underscore",
  });

const phoneSchema = z
  .string()
  .trim()
  .min(4)
  .max(24)
  .refine(isValidPhone, { message: "phone must be a valid mobile number" });

const displayUnitSchema = z.enum(["rial", "toman"]);

export const registerRequestSchema = z
  .object({
    email: emailSchema,
    password: passwordSchema,
    displayName: displayNameSchema,
    username: usernameSchema,
    phone: phoneSchema.optional(),
  })
  .strict();

export type RegisterRequestInput = z.infer<typeof registerRequestSchema>;

export const loginRequestSchema = z
  .object({
    email: emailSchema.optional(),
    identifier: z.string().trim().min(1).max(320).optional(),
    password: z.string().min(1).max(128),
  })
  .strict()
  .refine((v) => Boolean(v.email?.trim() || v.identifier?.trim()), {
    message: "Provide email or identifier",
  });

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

export const reauthRequestSchema = z
  .object({
    password: passwordSchema,
  })
  .strict();

export type ReauthRequestInput = z.infer<typeof reauthRequestSchema>;

export const deleteAccountRequestSchema = z
  .object({
    password: z.string().min(1).max(128).optional(),
    confirm: z.literal("DELETE"),
  })
  .strict();

export type DeleteAccountRequestInput = z.infer<typeof deleteAccountRequestSchema>;

/**
 * Runtime contract for GET /api/v1/auth/me/data-export (R10-14 / D3).
 * Soft shape — profile fields evolve; secrets must never appear.
 */
export const accountDataExportSchema = z
  .object({
    exportedAt: z.string().min(1),
    schemaVersion: z.literal(1),
    profile: z
      .object({
        userId: z.string().min(1),
        email: z.string().min(1),
        displayName: z.string(),
      })
      .passthrough(),
    workspaces: z.array(
      z
        .object({
          id: z.string().min(1),
          name: z.string(),
          slug: z.string().min(1),
          template: z.string().min(1),
        })
        .strict(),
    ),
    sessions: z.array(z.record(z.string(), z.unknown())),
    notes: z.array(z.string()).min(1),
  })
  .strict()
  .superRefine((val, ctx) => {
    const blob = JSON.stringify(val);
    for (const forbidden of [
      "passwordHash",
      "totpSecret",
      "tokenHash",
      "recoveryCodes",
    ]) {
      if (blob.includes(forbidden)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `export must not include ${forbidden}`,
        });
      }
    }
  });

export type AccountDataExportInput = z.infer<typeof accountDataExportSchema>;

export const updateProfileRequestSchema = z
  .object({
    displayName: displayNameSchema.optional(),
    locale: z.string().trim().min(2).max(32).optional(),
    timezone: z.string().trim().min(1).max(64).optional(),
    avatarUrl: z.string().trim().max(2048).nullable().optional(),
    username: usernameSchema.optional(),
    phone: phoneSchema.nullable().optional(),
    displayUnit: displayUnitSchema.nullable().optional(),
  })
  .strict();

export type UpdateProfileRequestInput = z.infer<typeof updateProfileRequestSchema>;

export const changeEmailRequestSchema = z
  .object({
    newEmail: emailSchema,
    currentPassword: z.string().min(1).max(128),
  })
  .strict();

export type ChangeEmailRequestInput = z.infer<typeof changeEmailRequestSchema>;

export const claimUsernameRequestSchema = z
  .object({
    username: usernameSchema,
  })
  .strict();

export type ClaimUsernameRequestInput = z.infer<typeof claimUsernameRequestSchema>;

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
