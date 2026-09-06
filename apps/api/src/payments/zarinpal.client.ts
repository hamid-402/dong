import {
  isZarinpalLive,
  loadAppEnv,
  zarinpalSandbox,
} from "@dang/config";

export type ZarinpalRequestInput = {
  amountMinor: string;
  description: string;
  callbackUrl: string;
  metadata?: Record<string, string>;
};

export type ZarinpalRequestResult = {
  authority: string;
  checkoutUrl: string;
};

export type ZarinpalVerifyInput = {
  amountMinor: string;
  authority: string;
};

export type ZarinpalVerifyResult = {
  refId: string;
  cardPan?: string;
};

function baseUrl(): string {
  return zarinpalSandbox()
    ? "https://sandbox.zarinpal.com"
    : "https://payment.zarinpal.com";
}

function startPayBase(): string {
  return zarinpalSandbox()
    ? "https://sandbox.zarinpal.com/pg/StartPay/"
    : "https://www.zarinpal.com/pg/StartPay/";
}

/**
 * Zarinpal v4 client — only call when isZarinpalLive().
 * Infra is ready; default env keeps this dormant.
 */
export async function zarinpalRequestPayment(
  input: ZarinpalRequestInput,
): Promise<ZarinpalRequestResult> {
  const env = loadAppEnv();
  if (!isZarinpalLive(env.zarinpalMerchantId)) {
    throw new Error("ZARINPAL_NOT_ENABLED");
  }
  const merchantId = env.zarinpalMerchantId!.trim();
  const amount = Number(input.amountMinor);
  if (!Number.isFinite(amount) || amount < 1000) {
    throw new Error("ZARINPAL_AMOUNT");
  }

  const response = await fetch(`${baseUrl()}/pg/v4/payment/request.json`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      merchant_id: merchantId,
      amount: Math.round(amount),
      description: input.description.slice(0, 255),
      callback_url: input.callbackUrl,
      metadata: input.metadata,
    }),
  });
  const body = (await response.json()) as {
    data?: { authority?: string; code?: number };
    errors?: unknown;
  };
  const authority = body.data?.authority;
  if (!response.ok || !authority) {
    throw new Error(`ZARINPAL_REQUEST_FAILED:${JSON.stringify(body.errors ?? body)}`);
  }
  return {
    authority,
    checkoutUrl: `${startPayBase()}${authority}`,
  };
}

export async function zarinpalVerifyPayment(
  input: ZarinpalVerifyInput,
): Promise<ZarinpalVerifyResult> {
  const env = loadAppEnv();
  if (!isZarinpalLive(env.zarinpalMerchantId)) {
    throw new Error("ZARINPAL_NOT_ENABLED");
  }
  const merchantId = env.zarinpalMerchantId!.trim();
  const amount = Number(input.amountMinor);
  const response = await fetch(`${baseUrl()}/pg/v4/payment/verify.json`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      merchant_id: merchantId,
      amount: Math.round(amount),
      authority: input.authority,
    }),
  });
  const body = (await response.json()) as {
    data?: { ref_id?: number | string; card_pan?: string; code?: number };
    errors?: unknown;
  };
  const refId = body.data?.ref_id;
  if (!response.ok || refId === undefined || refId === null) {
    throw new Error(`ZARINPAL_VERIFY_FAILED:${JSON.stringify(body.errors ?? body)}`);
  }
  return {
    refId: String(refId),
    cardPan: body.data?.card_pan,
  };
}
