import { HttpException, Inject, Injectable } from "@nestjs/common";
import { resolveSupportContactEmail } from "@dang/config";
import { MailerService } from "../auth/mailer.service.js";
import { createAdaptiveRateLimit } from "../auth/rate-limit.factory.js";
import type { RateLimiter } from "../auth/rate-limit.js";
import type {
  PublicContactRequest,
  PublicContactResponse,
} from "./public-contact.types.js";

@Injectable()
export class PublicContactService {
  private readonly limiter: RateLimiter = createAdaptiveRateLimit(8, 15 * 60_000);

  constructor(@Inject(MailerService) private readonly mailer: MailerService) {}

  async submit(
    body: PublicContactRequest,
    meta: { ip?: string },
  ): Promise<PublicContactResponse> {
    const key = `public-contact:${meta.ip?.trim() || "unknown"}`;
    const snap = await this.limiter.consume(key);
    if (!snap.allowed) {
      throw new HttpException(
        {
          type: "https://dang.local/problems/rate-limited",
          title: "Too many contact attempts",
          status: 429,
          detail: "لطفاً کمی بعد دوباره تلاش کنید.",
        },
        429,
      );
    }

    const to = resolveSupportContactEmail();
    if (!to) {
      return {
        accepted: true,
        delivered: false,
        mailerMode: this.mailer.mode(),
        suggestMailto: false,
      };
    }

    const subject = `[دنگ تماس] ${body.topic} — ${body.name || "بدون نام"}`;
    const text = [
      `موضوع: ${body.topic}`,
      `نام: ${body.name || "—"}`,
      `ایمیل پاسخ: ${body.email || "—"}`,
      `IP: ${meta.ip || "—"}`,
      "",
      body.message,
    ].join("\n");

    const sent = this.mailer.send({ to, subject, text });
    const mailerMode = this.mailer.mode();
    const delivered = Boolean(sent.delivered) && mailerMode !== "none";
    return {
      accepted: true,
      delivered,
      mailerMode,
      suggestMailto: !delivered,
    };
  }
}
