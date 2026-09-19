import { z } from "zod";

export const publicContactRequestSchema = z.object({
  name: z.string().trim().max(120).default(""),
  email: z.string().trim().max(200).default(""),
  topic: z.string().trim().min(2).max(80),
  message: z.string().trim().min(8).max(4000),
}).superRefine((value, ctx) => {
  if (value.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.email)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["email"],
      message: "ایمیل پاسخ معتبر نیست",
    });
  }
});

export type PublicContactRequest = z.infer<typeof publicContactRequestSchema>;

export type PublicContactResponse = {
  accepted: true;
  delivered: boolean;
  mailerMode: "resend" | "smtp" | "dev-log" | "none";
  /** When delivery is off, client should offer mailto compose. */
  suggestMailto: boolean;
};
