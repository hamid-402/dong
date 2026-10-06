"use client";

import { useState, type FormEvent } from "react";
import { useSiteStatus } from "@/components/site/marketing-shell";
import { ApiError, api } from "@/lib/api";

function buildMailto(
  inbox: string,
  params: {
    name: string;
    email: string;
    topic: string;
    message: string;
  },
): string {
  const subject = encodeURIComponent(`[دنگ] ${params.topic} — ${params.name || "بدون نام"}`);
  const body = encodeURIComponent(
    [
      `نام: ${params.name || "—"}`,
      `ایمیل پاسخ: ${params.email || "—"}`,
      `موضوع: ${params.topic}`,
      "",
      params.message,
    ].join("\n"),
  );
  return `mailto:${inbox}?subject=${subject}&body=${body}`;
}

/**
 * Contact form: POSTs to /public/contact when API is reachable.
 * Mailto only when capabilities.supportContactEmail is a real inbox.
 */
export function SiteContactForm() {
  const { caps, statusLabel, offline } = useSiteStatus();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [topic, setTopic] = useState("سوال عمومی");
  const [message, setMessage] = useState("");
  const [hint, setHint] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const supportInbox = caps?.supportContactEmail?.trim() || null;
  const emailLive =
    caps?.providers?.email === "resend" || caps?.providers?.email === "smtp";

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const trimmed = message.trim();
    if (trimmed.length < 8) {
      setHint("متن پیام را کمی کامل‌تر بنویسید (حداقل چند کلمه).");
      return;
    }

    const payload = {
      name: name.trim(),
      email: email.trim(),
      topic,
      message: trimmed,
    };

    if (offline) {
      if (supportInbox) {
        setHint(
          "API در دسترس نیست — برنامهٔ ایمیل شما برای ارسال مستقیم باز می‌شود.",
        );
        window.location.href = buildMailto(supportInbox, payload);
      } else {
        setHint(
          "API در دسترس نیست و صندوق پشتیبانی پیکربندی نشده — بعداً دوباره تلاش کنید.",
        );
      }
      return;
    }

    setBusy(true);
    setHint(null);
    try {
      const result = await api.publicContact(payload);
      if (result.delivered) {
        setHint("پیام پذیرفته و برای تحویل به صندوق پشتیبانی ارسال شد.");
        setMessage("");
        return;
      }
      setHint(
        result.mailerMode === "dev-log"
          ? "پیام در حالت توسعه ثبت شد (تحویل زنده نیست)."
          : supportInbox
            ? "تحویل ایمیل سرور فعال نیست — برنامهٔ ایمیل شما باز می‌شود."
            : "صندوق پشتیبانی پیکربندی نشده؛ پیام فقط در سرور پذیرفته شد بدون ادعای ارسال.",
      );
      if (result.suggestMailto && supportInbox) {
        window.location.href = buildMailto(supportInbox, payload);
      }
    } catch (err) {
      const detail =
        err instanceof ApiError ? err.message : "ارسال از طریق سرور ممکن نشد.";
      if (supportInbox) {
        setHint(`${detail} در حال باز کردن ایمیل مستقیم…`);
        window.location.href = buildMailto(supportInbox, payload);
      } else {
        setHint(detail);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      className="siteContactForm"
      onSubmit={(e) => {
        void onSubmit(e);
      }}
      noValidate
    >
      <div className="siteContactForm__grid">
        <label className="siteContactForm__field">
          <span>نام</span>
          <input
            type="text"
            name="name"
            autoComplete="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="اختیاری"
            disabled={busy}
          />
        </label>
        <label className="siteContactForm__field">
          <span>ایمیل برای پاسخ</span>
          <input
            type="email"
            name="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="اختیاری"
            disabled={busy}
          />
        </label>
      </div>
      <label className="siteContactForm__field">
        <span>موضوع</span>
        <select
          name="topic"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          disabled={busy}
        >
          <option>سوال عمومی</option>
          <option>پیشنهاد</option>
          <option>گزارش مشکل</option>
          <option>سازمانی / فروش</option>
        </select>
      </label>
      <label className="siteContactForm__field">
        <span>پیام</span>
        <textarea
          name="message"
          rows={5}
          required
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          disabled={busy}
        />
      </label>
      <p className="siteContactForm__honesty">
        {supportInbox ? (
          <>
            در صورت نیاز به ایمیل مستقیم:{" "}
            <a href={`mailto:${supportInbox}`}>{supportInbox}</a>.{" "}
          </>
        ) : (
          <>صندوق پشتیبانی در این محیط پیکربندی نشده (CONTACT_INBOX). </>
        )}
        {emailLive
          ? "تحویل ایمیل محصول برای جریان‌های داخلی فعال است."
          : "تحویل ایمیل محصول در capabilities به‌صورت stub/غیرزنده گزارش شده است."}{" "}
        وضعیت API: <strong>{offline ? "قطع" : statusLabel}</strong>
      </p>
      {hint ? <p className="siteContactForm__hint" role="status">{hint}</p> : null}
      <button
        type="submit"
        className="authLayout__headerBtn authLayout__headerBtn--primary"
        disabled={busy}
      >
        {busy ? "در حال ارسال…" : "ارسال پیام"}
      </button>
    </form>
  );
}
