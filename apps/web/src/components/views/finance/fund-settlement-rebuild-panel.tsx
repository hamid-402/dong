"use client";

import { useState } from "react";
import {
  formatFundPartyRebuildSummaryFa,
  type RebuildFundPartyJournalsResult,
} from "@dang/contracts";
import { Button } from "@dang/ui";
import { FormStack } from "@/components/ui-blocks";
import { AppModal } from "@/components/ui/app-modal";
import { friendlyErrorMessage } from "@/lib/api-errors";
import { api } from "@/lib/api";

type Props = {
  workspaceId: string;
  pending: boolean;
  onPendingChange: (run: () => void) => void;
  onSuccess: (message: string) => void;
  onError: (message: string) => void;
  onCompleted: () => void | Promise<void>;
};

/**
 * Opt-in migration UI for fund-as-settlement-party journals.
 * Shown only when productFlags.fundAsSettlementParty is on (parent gates).
 */
export function FundSettlementRebuildPanel({
  workspaceId,
  pending,
  onPendingChange,
  onSuccess,
  onError,
  onCompleted,
}: Props) {
  const [open, setOpen] = useState(false);
  const [force, setForce] = useState(false);
  const [lastResult, setLastResult] =
    useState<RebuildFundPartyJournalsResult | null>(null);

  function runRebuild() {
    setOpen(false);
    onPendingChange(() => {
      void (async () => {
        try {
          const result = await api.rebuildFundPartyJournals(workspaceId, {
            force,
          });
          setLastResult(result);
          onSuccess(formatFundPartyRebuildSummaryFa(result));
          await onCompleted();
        } catch (err) {
          onError(friendlyErrorMessage(err, "بازسازی ژورنال ناموفق بود"));
        } finally {
          setForce(false);
        }
      })();
    });
  }

  return (
    <section
      className="fundRebuildPanel"
      aria-labelledby="fund-rebuild-heading"
    >
      <h3 id="fund-rebuild-heading" className="fundRebuildPanel__title">
        مهاجرت ژورنال — صندوق طرف حساب
      </h3>
      <p className="liveHint fundRebuildPanel__lead">
        خرج‌های ثبت‌شده‌ای که هنوز با مدل شخص↔شخص در دفترکل هستند را به مدل
        «اعضا ↔ صندوق تنخواه» منتقل می‌کند. اجرای مجدد امن است؛ موارد مهاجرت‌شده
        رد می‌شوند مگر «اجباری» را بزنید.
      </p>
      <ul className="fundRebuildPanel__bullets liveHint">
        <li>ژورنال قدیمی با پسوند legacy برگردانده و نگه داشته می‌شود (حذف سخت نیست).</li>
        <li>فقط مدیر مالی؛ نیازمند فلگ فعال در capabilities.</li>
        <li>مانده‌ها و پیشنهاد تسویه پس از بازسازی از API تازه می‌شوند.</li>
      </ul>
      {lastResult ? (
        <p className="fundRebuildPanel__result" role="status">
          آخرین اجرا: {formatFundPartyRebuildSummaryFa(lastResult)}
        </p>
      ) : null}
      <Button
        type="button"
        variant="secondary"
        disabled={pending}
        onClick={() => setOpen(true)}
      >
        بازسازی ژورنال‌ها…
      </Button>

      {open ? (
        <AppModal
          open
          ariaLabel="تأیید بازسازی ژورنال صندوق"
          title="بازسازی ژورنال با مدل صندوق"
          onClose={() => {
            if (!pending) setOpen(false);
          }}
        >
          <p className="appModalLead">
            برای هر خرج ثبت‌شده، در صورت نیاز ژورنال کلاسیک برگردانده و با خطوط
            <code> fund:… </code>
            دوباره ثبت می‌شود. این کار موجودی نقدی تنخواه را جابه‌جا نمی‌کند؛ فقط
            طرف حساب تسویه را استاندارد می‌کند.
          </p>
          <FormStack>
            <label className="appModalFieldLabel fundRebuildPanel__force">
              <input
                type="checkbox"
                checked={force}
                onChange={(e) => setForce(e.target.checked)}
                disabled={pending}
              />
              <span>
                اجباری — حتی ژورنال‌هایی که از قبل مدل صندوق دارند دوباره نوشته
                شوند (معمولاً لازم نیست)
              </span>
            </label>
          </FormStack>
          <div className="appModalActions">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setOpen(false)}
              disabled={pending}
            >
              انصراف
            </Button>
            <Button type="button" onClick={runRebuild} disabled={pending}>
              {force ? "بازسازی اجباری" : "شروع بازسازی"}
            </Button>
          </div>
        </AppModal>
      ) : null}
    </section>
  );
}
