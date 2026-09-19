"use client";

import { useState, type FormEvent } from "react";
import { useSiteStatus } from "@/components/site/marketing-shell";
import { ApiError, api } from "@/lib/api";

const SUPPORT_EMAIL = "support@dang.local";

function buildMailto(params: {
  name: string;
  email: string;
  topic: string;
  message: string;
}): string {
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
  return `mailto:${SUPPORT_EMAIL}?subject=${subject}&body=${body}`;
}

/**
 * Contact form: POSTs to /public/contact when API is reachable.
 * Honest about delivery — falls back to mailto when mailer is stub/offline.
 */
export function SiteContactForm() {
  const { caps, statusLabel, offline } = useSiteStatus();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [topic, setTopic] = useState("سوال عمومی");
  const [message, setMessage] = useState("");
  const [hint, setHint] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const emailLive = caps?.providers?.email === "resend";

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
      setHint(
        "API در دسترس نیست — برنامهٔ ایمیل شما برای ارسال مستقیم باز می‌شود.",
      );
      window.location.href = buildMailto(payload);
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
          ? "پیام در حالت توسعه ثبت شد (تحویل زنده نیست). در صورت نیاز می‌توانید ایمیل مستقیم باز کنید."
          : "تحویل ایمیل سرور فعال نیست — برنامهٔ ایمیل شما باز می‌شود.",
      );
      if (result.suggestMailto) {
        window.location.href = buildMailto(payload);
      }
    } catch (err) {
      const detail =
        err instanceof ApiError ? err.message : "ارسال از طریق سرور ممکن نشد.";
      setHint(`${detail} در حال باز کردن ایمیل مستقیم…`);
      window.location.href = buildMailto(payload);
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
            placeholder="you@example.com"
            disabled={busy}
          />
        </label>
      </div>
      <label className="siteContactForm__field">
        <span>موضوع</span>
        <select
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          name="topic"
          disabled={busy}
        >
          <option>سوال عمومی</option>
          <option>پشتیبانی فنی</option>
          <option>گزارش مشکل</option>
          <option>همکاری تجاری</option>
        </select>
      </label>
      <label className="siteContactForm__field">
        <span>پیام</span>
        <textarea
          name="message"
          rows={6}
          required
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="شرح کوتاه درخواست…"
          disabled={busy}
        />
      </label>
      <p className="siteContactForm__honesty">
        درخواست به{" "}
        <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a> می‌رود. اگر
        تحویل سرور فعال نباشد، به برنامهٔ ایمیل دستگاه سوئیچ می‌شود — بدون ادعای
        جعلی «ارسال شد».
        {emailLive
          ? " در این محیط تحویل ایمیل محصول (Resend) برای جریان‌های داخلی فعال است."
          : " تحویل ایمیل محصول در capabilities به‌صورت stub/غیرزنده گزارش شده است."}{" "}
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
