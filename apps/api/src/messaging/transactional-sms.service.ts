/** Transactional SMS separate from auth MFA (G11 #45). */

export type SmsProviderMode = "none" | "stub" | "live";

export type SmsSendInput = {
  toE164: string;
  body: string;
  purpose: "transactional" | "otp_auth";
};

export type SmsSendResult = {
  ok: boolean;
  mode: SmsProviderMode;
  detail: string;
};

export function resolveSmsProvider(env: NodeJS.ProcessEnv = process.env): SmsProviderMode {
  const forced = (env.SMS_PROVIDER ?? "").trim().toLowerCase();
  if (forced === "none") return "none";
  const key = (env.SMS_API_KEY ?? "").trim();
  if ((forced === "live" || forced === "kavenegar" || forced === "ghasedak") && key) {
    return "live";
  }
  if (forced === "stub" || forced === "log" || forced === "") return key ? "live" : "stub";
  return "stub";
}

export class TransactionalSmsService {
  constructor(private readonly env: NodeJS.ProcessEnv = process.env) {}

  get mode(): SmsProviderMode {
    return resolveSmsProvider(this.env);
  }

  /** Auth OTP must not use this path until a dedicated OTP adapter exists. */
  async sendTransactional(input: Omit<SmsSendInput, "purpose">): Promise<SmsSendResult> {
    return this.send({ ...input, purpose: "transactional" });
  }

  async send(input: SmsSendInput): Promise<SmsSendResult> {
    if (input.purpose === "otp_auth") {
      return {
        ok: false,
        mode: this.mode,
        detail: "otp_auth not supported on transactional SMS path — use TOTP MFA",
      };
    }
    const mode = this.mode;
    if (mode === "none") {
      return { ok: false, mode, detail: "sms provider none" };
    }
    if (mode === "stub") {
       
      console.info(`[sms:stub] to=${input.toE164} body=${input.body.slice(0, 80)}`);
      return { ok: true, mode, detail: "stub logged" };
    }
    // Live path: adapter placeholder — requires SMS_API_KEY; no phone_verified_at side effect.
    return {
      ok: false,
      mode,
      detail: "live SMS HTTP adapter not configured for this build",
    };
  }
}
