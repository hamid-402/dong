import type {
  MessagingAdapter,
  MessagingChannel,
  MessagingSendInput,
  MessagingSendResult,
} from "./messaging.types.js";

export class StubMessagingAdapter implements MessagingAdapter {
  readonly channel: MessagingChannel = "stub";

  async send(input: MessagingSendInput): Promise<MessagingSendResult> {
    const detail = `stub messaging: workspace=${input.workspaceId} user=${input.userId} title=${input.title}`;
     
    console.info(`[messaging:stub] ${detail}`);
    return { ok: true, channel: "stub", detail };
  }
}

export class TelegramMessagingAdapter implements MessagingAdapter {
  readonly channel: MessagingChannel = "telegram";

  constructor(private readonly token: string) {}

  async send(input: MessagingSendInput): Promise<MessagingSendResult> {
    const chatId = input.metadata?.telegramChatId;
    if (!chatId) {
      return {
        ok: false,
        channel: "telegram",
        detail: "telegramChatId missing in metadata",
      };
    }
    const text = `${input.title}\n${input.body}`;
    const url = `https://api.telegram.org/bot${this.token}/sendMessage`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text }),
    });
    if (!res.ok) {
      return {
        ok: false,
        channel: "telegram",
        detail: `telegram HTTP ${res.status}`,
      };
    }
    return { ok: true, channel: "telegram", detail: "sent" };
  }
}

export class BaleMessagingAdapter implements MessagingAdapter {
  readonly channel: MessagingChannel = "bale";

  constructor(private readonly token: string) {}

  async send(input: MessagingSendInput): Promise<MessagingSendResult> {
    const chatId = input.metadata?.baleChatId;
    if (!chatId) {
      return {
        ok: false,
        channel: "bale",
        detail: "baleChatId missing in metadata",
      };
    }
    const text = `${input.title}\n${input.body}`;
    const url = `https://tapi.bale.ai/bot${this.token}/sendMessage`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text }),
    });
    if (!res.ok) {
      return {
        ok: false,
        channel: "bale",
        detail: `bale HTTP ${res.status}`,
      };
    }
    return { ok: true, channel: "bale", detail: "sent" };
  }
}

export function createMessagingAdapter(
  env: NodeJS.ProcessEnv = process.env,
): MessagingAdapter {
  const mode = (env.MESSAGING_PROVIDER ?? "").trim().toLowerCase();
  const tg = (env.TELEGRAM_BOT_TOKEN ?? "").trim();
  const bale = (env.BALE_BOT_TOKEN ?? "").trim();
  if ((mode === "telegram" || (!mode && tg)) && tg) {
    return new TelegramMessagingAdapter(tg);
  }
  if ((mode === "bale" || (!mode && bale && !tg)) && bale) {
    return new BaleMessagingAdapter(bale);
  }
  return new StubMessagingAdapter();
}
