type EnvBag = Record<string, string | undefined>;

function flag(name: string, env: EnvBag = process.env): boolean {
  const v = env[name]?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

/** Merchant id present — scaffolding configured, not necessarily live. */
export function isZarinpalMerchantConfigured(merchantId?: string): boolean {
  return Boolean(merchantId?.trim());
}

/**
 * Live PSP calls only when merchant + explicit enable.
 * Default off so infra can ship without live checkout.
 */
export function isZarinpalLive(
  merchantId?: string,
  processEnv: EnvBag = process.env,
): boolean {
  return isZarinpalMerchantConfigured(merchantId) && flag("ZARINPAL_ENABLED", processEnv);
}

export function zarinpalSandbox(processEnv: EnvBag = process.env): boolean {
  return !flag("ZARINPAL_PRODUCTION", processEnv);
}

export function isClamavHostConfigured(processEnv: EnvBag = process.env): boolean {
  return Boolean(processEnv.CLAMAV_HOST?.trim());
}

/** Live ClamAV TCP scan only with host + enable flag. */
export function isClamavLive(processEnv: EnvBag = process.env): boolean {
  return isClamavHostConfigured(processEnv) && flag("CLAMAV_ENABLED", processEnv);
}

export function clamavHostPort(processEnv: EnvBag = process.env): {
  host: string;
  port: number;
} {
  const host = processEnv.CLAMAV_HOST?.trim() || "127.0.0.1";
  const port = Number(processEnv.CLAMAV_PORT ?? "3310");
  return { host, port: Number.isFinite(port) ? port : 3310 };
}

export function isSmtpUrlConfigured(smtpUrl?: string): boolean {
  return Boolean(smtpUrl?.trim());
}

/**
 * SMTP transport only when URL set and EMAIL_TRANSPORT=smtp.
 * Resend remains the other live path via RESEND_API_KEY.
 */
export function isSmtpLive(
  smtpUrl?: string,
  processEnv: EnvBag = process.env,
): boolean {
  const transport = (processEnv.EMAIL_TRANSPORT ?? "").trim().toLowerCase();
  return isSmtpUrlConfigured(smtpUrl) && transport === "smtp";
}

export function isResendConfigured(processEnv: EnvBag = process.env): boolean {
  return Boolean(processEnv.RESEND_API_KEY?.trim());
}

export function isOcrHttpConfigured(processEnv: EnvBag = process.env): boolean {
  return Boolean(processEnv.OCR_HTTP_URL?.trim());
}

/** Optional HTTP OCR provider — off until OCR_ENABLED=1. */
export function isOcrLive(processEnv: EnvBag = process.env): boolean {
  return isOcrHttpConfigured(processEnv) && flag("OCR_ENABLED", processEnv);
}
