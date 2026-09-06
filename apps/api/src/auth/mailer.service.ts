import { Injectable } from "@nestjs/common";
import {
  isResendConfigured,
  isSmtpLive,
  loadAppEnv,
} from "@dang/config";
import { createLogger } from "@dang/observability";
import nodemailer from "nodemailer";

const logger = createLogger("dang-api-mailer");

export type OutboundMail = {
  to: string;
  subject: string;
  text: string;
  actionUrl?: string;
};

export type MailerMode = "resend" | "smtp" | "dev-log" | "none";

/**
 * Honest mail modes:
 * - resend: RESEND_API_KEY (live today when set)
 * - smtp: SMTP_URL + EMAIL_TRANSPORT=smtp (infra ready, default off)
 * - dev-log: local log only
 * - none: production without provider
 */
@Injectable()
export class MailerService {
  mode(): MailerMode {
    const env = loadAppEnv();
    if (isResendConfigured()) return "resend";
    if (isSmtpLive(env.smtpUrl)) return "smtp";
    if (env.nodeEnv === "production" && !env.allowDevAuth) return "none";
    return "dev-log";
  }

  /** True when a real transport will attempt delivery. */
  isLiveDelivery(): boolean {
    const m = this.mode();
    return m === "resend" || m === "smtp";
  }

  send(mail: OutboundMail): { delivered: boolean; debugUrl?: string } {
    const mode = this.mode();
    logger.info("Outbound mail", {
      to: mail.to.replace(/(.{2}).+(@.+)/, "$1***$2"),
      subject: mail.subject,
      mode,
      hasActionUrl: mail.actionUrl ? 1 : 0,
    });

    if (mode === "resend") {
      void this.deliverResend(mail).catch((err: unknown) => {
        logger.error("Mail delivery failed", {
          detail: err instanceof Error ? err.message : String(err),
        });
      });
      return { delivered: true };
    }

    if (mode === "smtp") {
      void this.deliverSmtp(mail).catch((err: unknown) => {
        logger.error("SMTP delivery failed", {
          detail: err instanceof Error ? err.message : String(err),
        });
      });
      return { delivered: true };
    }

    if (mode === "none") {
      return { delivered: false };
    }

    return { delivered: true, debugUrl: mail.actionUrl };
  }

  private async deliverResend(mail: OutboundMail): Promise<void> {
    const env = loadAppEnv();
    const resendKey = process.env.RESEND_API_KEY?.trim();
    if (!resendKey) {
      throw new Error("RESEND_API_KEY missing");
    }
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: env.smtpFrom || "دنگ همکاری <onboarding@resend.dev>",
        to: [mail.to],
        subject: mail.subject,
        text: mail.actionUrl ? `${mail.text}\n\n${mail.actionUrl}` : mail.text,
      }),
    });
    if (!response.ok) {
      throw new Error(`Resend ${response.status}: ${await response.text()}`);
    }
  }

  /** Nodemailer transport — activated only when isSmtpLive(). */
  private async deliverSmtp(mail: OutboundMail): Promise<void> {
    const env = loadAppEnv();
    if (!env.smtpUrl) throw new Error("SMTP_URL missing");
    const transport = nodemailer.createTransport(env.smtpUrl);
    await transport.sendMail({
      from: env.smtpFrom || "دنگ همکاری <noreply@localhost>",
      to: mail.to,
      subject: mail.subject,
      text: mail.actionUrl ? `${mail.text}\n\n${mail.actionUrl}` : mail.text,
    });
  }
}
