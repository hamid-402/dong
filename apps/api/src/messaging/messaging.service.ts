import { Inject, Injectable } from "@nestjs/common";
import {
  MESSAGING_ADAPTER,
  resolveMessagingProvider,
  type MessagingAdapter,
  type MessagingSendInput,
  type MessagingSendResult,
} from "./messaging.types.js";

@Injectable()
export class MessagingService {
  constructor(
    @Inject(MESSAGING_ADAPTER) private readonly adapter: MessagingAdapter,
  ) {}

  get provider(): ReturnType<typeof resolveMessagingProvider> {
    return resolveMessagingProvider();
  }

  get isLiveChannel(): boolean {
    const p = this.provider;
    return p === "telegram" || p === "bale";
  }

  async send(input: MessagingSendInput): Promise<MessagingSendResult> {
    if (this.provider === "none") {
      return { ok: false, channel: "stub", detail: "messaging provider none" };
    }
    return this.adapter.send(input);
  }
}
