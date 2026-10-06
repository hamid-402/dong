"use client";

import { useEffect, useState, useTransition } from "react";
import type {
  EmailDigestFrequency,
  NotificationPreferenceSummary,
  ProductFeatureFlags,
} from "@dang/contracts";
import { Button, SelectField } from "@dang/ui";
import { FormStack, SectionCard, StatusLine } from "@/components/ui-blocks";
import { api } from "@/lib/api";
import { friendlyErrorMessage } from "@/lib/api-errors";

const LABELS: Record<EmailDigestFrequency, string> = {
  off: "خاموش",
  weekly: "هفتگی",
  monthly: "ماهانه",
};

const EVENT_TOGGLES: {
  key: keyof Pick<
    NotificationPreferenceSummary,
    "expensePosted" | "settlementClaimed" | "inviteAccepted" | "securityAlert"
  >;
  label: string;
  hint: string;
}[] = [
  {
    key: "expensePosted",
    label: "ثبت پول",
    hint: "اعلان داخل‌برنامه وقتی پول (خرج کامل یا روزانه) ثبت می‌شود",
  },
  {
    key: "settlementClaimed",
    label: "تسویه (ادعا و تأیید)",
    hint: "اعلان داخل‌برنامه وقتی ادعای تسویه ثبت یا تأیید می‌شود",
  },
  {
    key: "inviteAccepted",
    label: "پذیرش دعوت",
    hint: "اعلان به مالک/مدیر وقتی دعوت پذیرفته می‌شود",
  },
  {
    key: "securityAlert",
    label: "هشدار امنیتی",
    hint: "اعلان رویدادهایی مثل break-glass روی حساب شما",
  },
];

/** Account notification prefs — digest gated by weeklyDigest; event toggles always. */
export function NotificationPrefsPanel({
  flags,
  emailProvider,
  onError,
}: {
  flags: ProductFeatureFlags | undefined;
  /** Live capabilities.providers.email — honesty for digest delivery. */
  emailProvider?: "smtp" | "log" | "none" | (string & {});
  onError: (message: string | null) => void;
}) {
  const [freq, setFreq] = useState<EmailDigestFrequency>("off");
  const [expensePosted, setExpensePosted] = useState(true);
  const [settlementClaimed, setSettlementClaimed] = useState(true);
  const [inviteAccepted, setInviteAccepted] = useState(true);
  const [securityAlert, setSecurityAlert] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    void api
      .getNotificationPrefs()
      .then((prefs) => {
        setFreq(prefs.emailDigest);
        setExpensePosted(prefs.expensePosted ?? true);
        setSettlementClaimed(prefs.settlementClaimed ?? true);
        setInviteAccepted(prefs.inviteAccepted ?? true);
        setSecurityAlert(prefs.securityAlert ?? true);
        setLoaded(true);
      })
      .catch((err: unknown) =>
        onError(friendlyErrorMessage(err, "بارگذاری ترجیح اعلان ناموفق")),
      );
  }, [onError]);

  function eventValue(
    key: (typeof EVENT_TOGGLES)[number]["key"],
  ): boolean {
    switch (key) {
      case "expensePosted":
        return expensePosted;
      case "settlementClaimed":
        return settlementClaimed;
      case "inviteAccepted":
        return inviteAccepted;
      case "securityAlert":
        return securityAlert;
    }
  }

  function setEventValue(
    key: (typeof EVENT_TOGGLES)[number]["key"],
    next: boolean,
  ) {
    switch (key) {
      case "expensePosted":
        setExpensePosted(next);
        break;
      case "settlementClaimed":
        setSettlementClaimed(next);
        break;
      case "inviteAccepted":
        setInviteAccepted(next);
        break;
      case "securityAlert":
        setSecurityAlert(next);
        break;
    }
  }

  function save() {
    startTransition(() => {
      void api
        .putNotificationPrefs({
          emailDigest: flags?.weeklyDigest ? freq : "off",
          expensePosted,
          settlementClaimed,
          inviteAccepted,
          securityAlert,
        })
        .then((prefs) => {
          setFreq(prefs.emailDigest);
          setExpensePosted(prefs.expensePosted ?? true);
          setSettlementClaimed(prefs.settlementClaimed ?? true);
          setInviteAccepted(prefs.inviteAccepted ?? true);
          setSecurityAlert(prefs.securityAlert ?? true);
          onError(null);
        })
        .catch((err: unknown) =>
          onError(friendlyErrorMessage(err, "ذخیره ترجیح اعلان ناموفق")),
        );
    });
  }

  return (
    <>
      <SectionCard title="اعلان‌های داخل‌برنامه" tone="quiet">
        <StatusLine>
          خاموش‌کردن هر مورد، اعلان داخل‌برنامه همان رویداد را برای شما قطع می‌کند
          (capabilities: notificationEventPrefs=in_app_v1).
        </StatusLine>
        <FormStack>
          {EVENT_TOGGLES.map((item) => (
            <label key={item.key} htmlFor={`notif-${item.key}`} className="privacyToggle">
              <span>
                <strong>{item.label}</strong>
                <small>{item.hint}</small>
              </span>
              <input
                id={`notif-${item.key}`}
                type="checkbox"
                checked={eventValue(item.key)}
                disabled={!loaded || pending}
                onChange={(e) => setEventValue(item.key, e.target.checked)}
              />
            </label>
          ))}
          <Button type="button" onClick={save} disabled={!loaded || pending}>
            ذخیره ترجیح اعلان
          </Button>
        </FormStack>
      </SectionCard>

      {flags?.weeklyDigest ? (
        <SectionCard title="خلاصهٔ ایمیلی" tone="quiet">
          <StatusLine>
            {emailProvider === "smtp"
              ? "ترجیح ذخیره می‌شود؛ ارسال واقعی با Mailer SMTP وصل است. زمان آخرین digest در این نسخه ثبت نمی‌شود — آمار ساختگی نشان داده نمی‌شود. اعلان push وب نداریم."
              : emailProvider === "log"
                ? "ترجیح ذخیره می‌شود؛ ایمیل فقط در لاگ محلی می‌افتد (ارسال واقعی نیست). آخرین digest ثبت نمی‌شود. اعلان push وب نداریم."
                : "ترجیح ذخیره می‌شود؛ ارسال واقعی وابسته به Mailer در capabilities است (الان خاموش/آزمایشی). آخرین digest ثبت نمی‌شود — آمار ساختگی نیست. اعلان push وب نداریم."}
          </StatusLine>
          <FormStack>
            <SelectField
              label="دورهٔ خلاصه"
              value={freq}
              onChange={(e) => setFreq(e.target.value as EmailDigestFrequency)}
              disabled={!loaded || pending}
            >
              {(Object.keys(LABELS) as EmailDigestFrequency[]).map((key) => (
                <option key={key} value={key}>
                  {LABELS[key]}
                </option>
              ))}
            </SelectField>
            <Button type="button" onClick={save} disabled={!loaded || pending}>
              ذخیره خلاصه ایمیلی
            </Button>
          </FormStack>
        </SectionCard>
      ) : null}
    </>
  );
}
