import assert from "node:assert/strict";
import test from "node:test";
import { PublicContactService } from "./public-contact.service.js";
import type { MailerService } from "../auth/mailer.service.js";

function fakeMailer(mode: "resend" | "dev-log" | "none"): MailerService {
  return {
    mode: () => mode,
    isLiveDelivery: () => mode === "resend",
    send: () => ({ delivered: mode !== "none" }),
  } as unknown as MailerService;
}

test("public contact delivers when mailer is live", async () => {
  const previous = process.env.CONTACT_INBOX;
  process.env.CONTACT_INBOX = "support@example.com";
  try {
  const svc = new PublicContactService(fakeMailer("resend"));
  const out = await svc.submit(
    {
      name: "آزما",
      email: "a@example.com",
      topic: "سوال عمومی",
      message: "سلام این یک پیام آزمایشی کافی طولانی است",
    },
    { ip: "127.0.0.1" },
  );
  assert.equal(out.accepted, true);
  assert.equal(out.delivered, true);
  assert.equal(out.suggestMailto, false);
  } finally {
    if (previous === undefined) delete process.env.CONTACT_INBOX;
    else process.env.CONTACT_INBOX = previous;
  }
});

test("public contact suggests mailto when mailer is none", async () => {
  const previous = process.env.CONTACT_INBOX;
  process.env.CONTACT_INBOX = "support@example.com";
  try {
  const svc = new PublicContactService(fakeMailer("none"));
  const out = await svc.submit(
    {
      name: "",
      email: "",
      topic: "پشتیبانی فنی",
      message: "شرح مشکل به اندازه کافی بلند است",
    },
    { ip: "10.0.0.2" },
  );
  assert.equal(out.delivered, false);
  assert.equal(out.suggestMailto, true);
  assert.equal(out.mailerMode, "none");
  } finally {
    if (previous === undefined) delete process.env.CONTACT_INBOX;
    else process.env.CONTACT_INBOX = previous;
  }
});
