"use client";

import { useEffect, useState, useTransition } from "react";
import type { EmailDigestFrequency, ProductFeatureFlags } from "@dang/contracts";
import { Button, SelectField } from "@dang/ui";
import { FormStack, SectionCard, StatusLine } from "@/components/ui-blocks";
import { api } from "@/lib/api";
import { friendlyErrorMessage } from "@/lib/api-errors";

const LABELS: Record<EmailDigestFrequency, string> = {
  off: "خاموش",
  weekly: "هفتگی",
  monthly: "ماهانه",
};

/** Opt-in digest prefs only — no fake analytics; gated by productFlags.weeklyDigest. */
export function NotificationPrefsPanel({
  flags,
  onError,
}: {
  flags: ProductFeatureFlags | undefined;
  onError: (message: string | null) => void;
}) {
  const [freq, setFreq] = useState<EmailDigestFrequency>("off");
  const [loaded, setLoaded] = useState(false);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!flags?.weeklyDigest) return;
    void api
      .getNotificationPrefs()
      .then((prefs) => {
        setFreq(prefs.emailDigest);
        setLoaded(true);
      })
      .catch((err: unknown) =>
        onError(friendlyErrorMessage(err, "بارگذاری ترجیح اعلان ناموفق")),
      );
  }, [flags?.weeklyDigest, onError]);

  if (!flags?.weeklyDigest) return null;

  function save() {
    startTransition(() => {
      void api
        .putNotificationPrefs(freq)
        .then((prefs) => {
          setFreq(prefs.emailDigest);
          onError(null);
        })
        .catch((err: unknown) =>
          onError(friendlyErrorMessage(err, "ذخیره ترجیح اعلان ناموفق")),
        );
    });
  }

  return (
    <SectionCard title="خلاصهٔ ایمیلی" tone="quiet">
      <StatusLine>
        فقط ترجیح شما — ارسال واقعی وابسته به Mailer در capabilities است؛ آمار ساختگی نیست.
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
          ذخیره
        </Button>
      </FormStack>
    </SectionCard>
  );
}
