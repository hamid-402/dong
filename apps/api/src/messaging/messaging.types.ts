export type MessagingChannel = "stub" | "telegram" | "bale";

export type MessagingSendInput = {
  workspaceId: string;
  userId: string;
  title: string;
  body: string;
  metadata?: Record<string, string>;
};

export type MessagingSendResult = {
  ok: boolean;
  channel: MessagingChannel;
  detail: string;
};

export interface MessagingAdapter {
  readonly channel: MessagingChannel;
  send(input: MessagingSendInput): Promise<MessagingSendResult>;
}

export const MESSAGING_ADAPTER = Symbol("MESSAGING_ADAPTER");

/** Resolve capability from env — never claim live without bot token. */
export function resolveMessagingProvider(
  env: NodeJS.ProcessEnv = process.env,
): "none" | "stub" | "telegram" | "bale" {
  const forced = (env.MESSAGING_PROVIDER ?? "").trim().toLowerCase();
  if (forced === "none") return "none";
  if (forced === "telegram" && (env.TELEGRAM_BOT_TOKEN ?? "").trim()) return "telegram";
  if (forced === "bale" && (env.BALE_BOT_TOKEN ?? "").trim()) return "bale";
  if ((env.TELEGRAM_BOT_TOKEN ?? "").trim()) return "telegram";
  if ((env.BALE_BOT_TOKEN ?? "").trim()) return "bale";
  if (forced === "stub" || forced === "" || forced === "log") return "stub";
  return "stub";
}
