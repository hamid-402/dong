"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import {
  JALALI_MONTH_FA,
  formatJalaliIso,
  parseIsoToJalali,
  resolveDailyLedgerRange,
  shiftDailyLedgerRange,
  suggestMinimalSettlements,
  weekdayFaSatFirst,
} from "@dang/contracts";
import type {
  DailyLedgerItem,
  DailyLedgerRangePreset,
  DailyLedgerResponse,
  WorkspaceBalancesResponse,
  WorkspaceSummary,
} from "@dang/contracts";
import { Amount, Button, SelectField, TextField } from "@dang/ui";
import { JalaliDateField } from "@/components/jalali-date-field";
import {
  EmptyHint,
  FormStack,
  SectionCard,
  StatusLine,
  StatusPill,
} from "@/components/ui-blocks";
import { api } from "@/lib/api";
import { friendlyErrorMessage } from "@/lib/api-errors";
import { hubPathFor } from "@/lib/hub-links";
import { tomanInputToIrrMinor } from "@/lib/irr-money";
import { useAppChrome } from "@/lib/use-app-chrome";
import { useIsNarrow } from "@/lib/use-viewport";

function formatTomanMinor(minor: string): string {
  const toman = Number(minor) / 10;
  if (!Number.isFinite(toman)) return "0";
  return new Intl.NumberFormat("fa-IR").format(toman);
}

function todayIsoLocal(): string {
  const n = new Date();
  const y = n.getFullYear();
  const m = String(n.getMonth() + 1).padStart(2, "0");
  const d = String(n.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function rangeHeadline(from: string, to: string, preset: DailyLedgerRangePreset): string {
  if (from === to) return formatJalaliIso(from);
  if (preset === "month") {
    const j = parseIsoToJalali(from);
    if (j) return `${JALALI_MONTH_FA[j.jm - 1]} ${j.jy}`;
  }
  if (preset === "year") {
    const j = parseIsoToJalali(from);
    if (j) return `سال ${j.jy}`;
  }
  if (preset === "week") {
    return `هفته ${formatJalaliIso(from)} تا ${formatJalaliIso(to)}`;
  }
  return `${formatJalaliIso(from)} تا ${formatJalaliIso(to)}`;
}

function dayItemCount(ledger: DailyLedgerResponse, date: string): number {
  const row = ledger.days.find((d) => d.date === date);
  if (!row) return 0;
  let n = row.shared.items.length;
  for (const m of ledger.members) {
    n += row.members[m.userId]?.items.length ?? 0;
  }
  return n;
}

type DraftTarget =
  | {
      kind: "member";
      date: string;
      userId: string;
      displayName: string;
      expenseId?: string;
    }
  | { kind: "shared"; date: string; expenseId?: string };

/** Professional day×member consumption ledger — API-backed only. */
export function DailyLedgerView() {
  const chrome = useAppChrome();
  const isNarrow = useIsNarrow();
  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[]>([]);
  const [workspaceId, setWorkspaceId] = useState("");
  const [preset, setPreset] = useState<DailyLedgerRangePreset>("week");
  const [from, setFrom] = useState(() => resolveDailyLedgerRange("week").from);
  const [to, setTo] = useState(() => resolveDailyLedgerRange("week").to);
  const [daysCount, setDaysCount] = useState(7);
  const [showGregorian, setShowGregorian] = useState(false);
  const [ledger, setLedger] = useState<DailyLedgerResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [draft, setDraft] = useState<DraftTarget | null>(null);
  const [draftDate, setDraftDate] = useState("");
  const [draftColumn, setDraftColumn] = useState<string>("shared");
  const [itemName, setItemName] = useState("");
  const [itemToman, setItemToman] = useState("");
  const [dayNote, setDayNote] = useState<{ date: string; note: string } | null>(null);
  const [importCsv, setImportCsv] = useState("");
  const [viewMode, setViewMode] = useState<"table" | "cards">("table");
  const [viewModeTouched, setViewModeTouched] = useState(false);
  const [info, setInfo] = useState<string | null>(null);
  const [showTip, setShowTip] = useState(false);
  const [balances, setBalances] = useState<WorkspaceBalancesResponse | null>(null);
  const [lockReason, setLockReason] = useState("");
  const [showCustomRange, setShowCustomRange] = useState(false);
  const todayIso = todayIsoLocal();

  useEffect(() => {
    if (viewModeTouched) return;
    setViewMode(isNarrow ? "cards" : "table");
  }, [isNarrow, viewModeTouched]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const key = "dang.daily-ledger.onboard.v1";
    if (!window.localStorage.getItem(key)) {
      setShowTip(true);
    }
  }, []);

  function dismissTip() {
    setShowTip(false);
    if (typeof window !== "undefined") {
      window.localStorage.setItem("dang.daily-ledger.onboard.v1", "1");
    }
  }

  useEffect(() => {
    if (!chrome.ready) return;
    void (async () => {
      try {
        const list = await api.listWorkspaces();
        const usable = list.filter((w) => w.template !== "personal");
        setWorkspaces(usable);
        const selected =
          usable.find((w) => w.id === chrome.workspaceId)?.id ?? usable[0]?.id ?? "";
        setWorkspaceId(selected);
      } catch (err: unknown) {
        setError(friendlyErrorMessage(err, "بارگذاری فضاها ناموفق"));
      }
    })();
  }, [chrome.ready, chrome.workspaceId]);

  function applyPreset(next: DailyLedgerRangePreset) {
    setPreset(next);
    const range = resolveDailyLedgerRange(next, new Date(), { from, to, days: daysCount });
    setFrom(range.from);
    setTo(range.to);
  }

  function applyDaysCount(n: number) {
    const days = Math.min(Math.max(Math.floor(n) || 7, 1), 93);
    setDaysCount(days);
    setPreset("days");
    const range = resolveDailyLedgerRange("days", new Date(), { from: "", to: "", days });
    setFrom(range.from);
    setTo(range.to);
  }

  function shiftPeriod(delta: -1 | 1) {
    const nextPreset = preset === "custom" ? "week" : preset;
    if (preset === "custom") setPreset("week");
    const range = shiftDailyLedgerRange(nextPreset, from, to, delta, daysCount);
    setFrom(range.from);
    setTo(range.to);
  }

  function goTodayPeriod() {
    const next = preset === "custom" || preset === "days" ? "week" : preset;
    applyPreset(next);
  }

  useEffect(() => {
    if (!draft && !dayNote) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setDraft(null);
        setDayNote(null);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [draft, dayNote]);

  function load() {
    if (!workspaceId) return;
    startTransition(() => {
      void (async () => {
        try {
          const [data, bal] = await Promise.all([
            api.dailyLedger(workspaceId, { from, to, preset: "custom" }),
            api.getBalances(workspaceId).catch(() => null),
          ]);
          setLedger(data);
          setBalances(bal);
          setError(null);
          chrome.selectWorkspace(workspaceId);
        } catch (err: unknown) {
          setError(friendlyErrorMessage(err, "بارگذاری دفتر روزانه ناموفق"));
        }
      })();
    });
  }

  useEffect(() => {
    if (!chrome.ready || !workspaceId) return;
    load();
  }, [chrome.ready, workspaceId, from, to]);

  function openDraft(target: DraftTarget, item?: DailyLedgerItem) {
    setDraft(target);
    setDraftDate(target.date);
    setDraftColumn(target.kind === "member" ? target.userId : "shared");
    setItemName(item?.title ?? "");
    setItemToman(item ? String(Number(item.amount.amountMinor) / 10) : "");
  }

  function submitEntry() {
    if (!workspaceId || !draft) return;
    const amount = tomanInputToIrrMinor(itemToman);
    if (!itemName.trim() || !amount) {
      setError("نام کالا و مبلغ (تومان / IRR) لازم است");
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(draftDate)) {
      setError("تاریخ شمسی را انتخاب کنید");
      return;
    }
    const memberUserId = draftColumn === "shared" ? null : draftColumn;
    startTransition(() => {
      void (async () => {
        try {
          if (draft.expenseId) {
            await api.updateDailyLedgerEntry(workspaceId, draft.expenseId, {
              itemName: itemName.trim(),
              amount,
              date: draftDate,
              memberUserId,
              idempotencyKey: crypto.randomUUID(),
            });
          } else {
            await api.createDailyLedgerEntry(workspaceId, {
              date: draftDate,
              itemName: itemName.trim(),
              amount,
              memberUserId,
              idempotencyKey: crypto.randomUUID(),
            });
          }
          setDraft(null);
          setError(null);
          load();
        } catch (err: unknown) {
          setError(friendlyErrorMessage(err, draft.expenseId ? "ویرایش قلم ناموفق" : "ثبت قلم ناموفق"));
        }
      })();
    });
  }

  function deleteItem(expenseId: string) {
    if (!workspaceId) return;
    if (!window.confirm("این قلم ابطال شود؟")) return;
    startTransition(() => {
      void (async () => {
        try {
          await api.deleteDailyLedgerEntry(workspaceId, expenseId);
          setError(null);
          load();
        } catch (err: unknown) {
          setError(friendlyErrorMessage(err, "حذف قلم ناموفق"));
        }
      })();
    });
  }

  function toggleHoliday(date: string, current: boolean) {
    if (!workspaceId || !ledger) return;
    if (!current) {
      const count = dayItemCount(ledger, date);
      if (
        count > 0 &&
        !window.confirm(
          `با تعطیل کردن این روز، ${count} قلم دفتر ابطال می‌شود (قابل بازیابی با برداشتن تعطیلی). ادامه؟`,
        )
      ) {
        return;
      }
    } else {
      if (
        !window.confirm(
          "با برداشتن تعطیلی، قلم‌های ابطال‌شدهٔ همان روز (در صورت موجود بودن) دوباره ثبت می‌شوند.",
        )
      ) {
        return;
      }
    }
    startTransition(() => {
      void (async () => {
        try {
          const result = await api.upsertDailyLedgerDay(workspaceId, date, { isHoliday: !current });
          if (current && result.restore) {
            setInfo(
              `تعطیلی برداشته شد · بازیابی ${result.restore.restored} قلم` +
                (result.restore.failed > 0 ? ` · ناموفق ${result.restore.failed}` : ""),
            );
          } else {
            setInfo(current ? "تعطیلی برداشته شد" : "روز تعطیل شد");
          }
          load();
        } catch (err: unknown) {
          setError(friendlyErrorMessage(err, "ثبت تعطیلی ناموفق"));
        }
      })();
    });
  }

  function lockRange() {
    if (!workspaceId) return;
    startTransition(() => {
      void (async () => {
        try {
          await api.createDailyLedgerRangeLock(workspaceId, {
            from,
            to,
            reason: lockReason.trim() || undefined,
            idempotencyKey: crypto.randomUUID(),
          });
          setInfo("بازه قفل شد — ثبت/ویرایش قلم در این روزها بسته است");
          setLockReason("");
          load();
        } catch (err: unknown) {
          setError(friendlyErrorMessage(err, "قفل بازه ناموفق"));
        }
      })();
    });
  }

  function unlockLock(lockId: string) {
    if (!workspaceId) return;
    startTransition(() => {
      void (async () => {
        try {
          await api.unlockDailyLedgerRangeLock(workspaceId, lockId);
          setInfo("قفل بازه باز شد");
          load();
        } catch (err: unknown) {
          setError(friendlyErrorMessage(err, "باز کردن قفل ناموفق"));
        }
      })();
    });
  }

  function saveDayNote() {
    if (!workspaceId || !dayNote) return;
    startTransition(() => {
      void (async () => {
        try {
          await api.upsertDailyLedgerDay(workspaceId, dayNote.date, {
            note: dayNote.note.trim() || null,
          });
          setDayNote(null);
          load();
        } catch (err: unknown) {
          setError(friendlyErrorMessage(err, "ذخیره توضیح ناموفق"));
        }
      })();
    });
  }

  function exportCsv() {
    if (!workspaceId) return;
    window.open(
      api.downloadDailyLedgerCsvUrl(workspaceId, { from, to, preset: "custom" }),
      "_blank",
    );
  }

  function runImport() {
    if (!workspaceId || !importCsv.trim()) return;
    startTransition(() => {
      void (async () => {
        try {
          const result = await api.importDailyLedgerCsv(workspaceId, {
            csv: importCsv,
            idempotencyKey: crypto.randomUUID(),
          });
          setInfo(`ورود: ${result.imported} قلم · رد شده: ${result.skipped}`);
          setImportCsv("");
          setError(null);
          load();
        } catch (err: unknown) {
          setError(friendlyErrorMessage(err, "ورود CSV ناموفق"));
        }
      })();
    });
  }

  const trendMax = ledger
    ? Math.max(
        ...ledger.members.map((m) =>
          Number(ledger.totals.members[m.userId]?.amountMinor ?? "0"),
        ),
        Number(ledger.totals.shared.amountMinor),
        1,
      )
    : 1;

  return (
    <SectionCard title="دفتر روزانه گروه" delayClass="delay1">
      <FormStack>
        {showTip ? (
          <div className="dlOnboard" role="note">
            <b>شروع سریع دفتر روزانه</b>
            <ol>
              <li>با دکمه‌های ‹ › بین هفته‌های شمسی جابه‌جا شوید.</li>
              <li>روی «+ کالا» نام و مبلغ (تومان) را جدا وارد کنید.</li>
              <li>تاریخ و ستون هر قلم در فرم قابل تغییر است.</li>
            </ol>
            <Button type="button" onClick={dismissTip}>
              متوجه شدم
            </Button>
          </div>
        ) : null}

        <div className="dlShell">
          <div className="dlToolbar">
            <SelectField
              label="فضا / گروه"
              value={workspaceId}
              onChange={(e) => setWorkspaceId(e.target.value)}
            >
              {workspaces.length === 0 ? <option value="">فضایی نیست</option> : null}
              {workspaces.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </SelectField>

            <div className="dlPeriodNav" role="group" aria-label="جابه‌جایی بازه">
              <button type="button" className="dlNavBtn" onClick={() => shiftPeriod(-1)} aria-label="بازه قبل">
                ›
              </button>
              <div className="dlPeriodMeta">
                <strong>{rangeHeadline(from, to, preset)}</strong>
                <span>
                  {preset === "week"
                    ? "شنبه تا جمعه"
                    : preset === "month"
                      ? "ماه شمسی"
                      : preset === "year"
                        ? "سال شمسی"
                        : `${Math.max(1, Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000) + 1)} روز`}
                </span>
              </div>
              <button type="button" className="dlNavBtn" onClick={() => shiftPeriod(1)} aria-label="بازه بعد">
                ‹
              </button>
              <button type="button" className="pfFocusChip" onClick={goTodayPeriod}>
                برو به امروز
              </button>
            </div>

            <div className="dlPresets" role="group" aria-label="بازه">
              {(
                [
                  ["day", "امروز"],
                  ["week", "هفته"],
                  ["month", "ماه"],
                  ["year", "سال"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  className={preset === id ? "pfFocusChip isActive" : "pfFocusChip"}
                  onClick={() => applyPreset(id)}
                >
                  {label}
                </button>
              ))}
              <label className={preset === "days" ? "dlDaysChip isActive" : "dlDaysChip"}>
                <span>آخر</span>
                <input
                  type="number"
                  min={1}
                  max={93}
                  value={daysCount}
                  onChange={(e) => applyDaysCount(Number(e.target.value))}
                  aria-label="تعداد روز"
                />
                <span>روز</span>
              </label>
              <button
                type="button"
                className={showCustomRange || preset === "custom" ? "pfFocusChip isActive" : "pfFocusChip"}
                onClick={() => setShowCustomRange((v) => !v)}
              >
                بازه دستی
              </button>
            </div>

            {showCustomRange || preset === "custom" ? (
              <div className="dlCustomRange">
                <JalaliDateField
                  label="از"
                  value={from}
                  onChange={(iso) => {
                    setPreset("custom");
                    setFrom(iso);
                  }}
                />
                <JalaliDateField
                  label="تا"
                  value={to}
                  onChange={(iso) => {
                    setPreset("custom");
                    setTo(iso);
                  }}
                />
                <Button type="button" onClick={load} disabled={pending || !workspaceId}>
                  {pending ? "…" : "اعمال"}
                </Button>
              </div>
            ) : null}

            <div className="dlToolbarActions">
              <div className="dlPresets" role="group" aria-label="نمایش">
                <button
                  type="button"
                  className={viewMode === "table" ? "pfFocusChip isActive" : "pfFocusChip"}
                  onClick={() => {
                    setViewModeTouched(true);
                    setViewMode("table");
                  }}
                >
                  جدول
                </button>
                <button
                  type="button"
                  className={viewMode === "cards" ? "pfFocusChip isActive" : "pfFocusChip"}
                  onClick={() => {
                    setViewModeTouched(true);
                    setViewMode("cards");
                  }}
                >
                  کارت
                </button>
                <button
                  type="button"
                  className={showGregorian ? "pfFocusChip isActive" : "pfFocusChip"}
                  onClick={() => setShowGregorian((v) => !v)}
                >
                  میلادی
                </button>
              </div>
              <Button type="button" onClick={exportCsv} disabled={!workspaceId || !ledger}>
                خروجی CSV
              </Button>
              <Link className="dlLinkBtn" href={`${hubPathFor("/workspaces")}#settlement-panel`}>
                تسویه
              </Link>
            </div>
          </div>

          {error ? <p className="liveError">{error}</p> : null}
          {info ? <p className="liveSuccess">{info}</p> : null}

          {ledger ? (
            <div className="dlSummary" aria-label="خلاصه بازه">
              <div>
                <span>جمع بازه</span>
                <strong>
                  <Amount irrMinor={ledger.totals.grand.amountMinor} />
                </strong>
              </div>
              <div>
                <span>هزینه مشترک</span>
                <strong>
                  <Amount irrMinor={ledger.totals.shared.amountMinor} />
                </strong>
              </div>
              <div>
                <span>روزها</span>
                <strong>{new Intl.NumberFormat("fa-IR").format(ledger.days.length)}</strong>
              </div>
              <div>
                <span>ذخیره</span>
                <strong>
                  {ledger.source.expense === "postgres" ? "Postgres" : "حافظه"}
                </strong>
              </div>
            </div>
          ) : null}

        {ledger?.canManageLocks ? (
          <details className="reportDetails">
            <summary>
              <span>قفل بازه (بستن ماه/دوره)</span>
              <span>{ledger.rangeLocks.filter((l) => l.active).length} فعال</span>
            </summary>
            <div className="reportDetails__body">
              <StatusLine>
                فقط owner/admin/finance — پس از قفل، ثبت و ویرایش قلم در بازه بسته می‌شود.
              </StatusLine>
              <TextField
                label="دلیل (اختیاری)"
                value={lockReason}
                onChange={(e) => setLockReason(e.target.value)}
                placeholder="بستن ماه شهریور"
              />
              <div className="dlModalActions">
                <Button type="button" onClick={lockRange} disabled={pending}>
                  قفل {formatJalaliIso(from)} تا {formatJalaliIso(to)}
                </Button>
              </div>
              {ledger.rangeLocks.filter((l) => l.active).length > 0 ? (
                <ul className="dlLockList">
                  {ledger.rangeLocks
                    .filter((l) => l.active)
                    .map((l) => (
                      <li key={l.id}>
                        <span>
                          {formatJalaliIso(l.from)} → {formatJalaliIso(l.to)}
                          {l.reason ? ` · ${l.reason}` : ""}
                        </span>
                        <button type="button" className="dlItemBtn" onClick={() => unlockLock(l.id)}>
                          باز کردن
                        </button>
                      </li>
                    ))}
                </ul>
              ) : null}
            </div>
          </details>
        ) : null}

        {balances && balances.lines.length > 0 ? (
          <details className="reportDetails">
            <summary>
              <span>پیشنهاد تسویه از مانده واقعی</span>
              <span>{balances.source}</span>
            </summary>
            <div className="reportDetails__body">
              <StatusLine>
                از ژورنال مانده‌ها (نه فقط مصرف دفتر) — برای ثبت به صفحه مالی بروید.
              </StatusLine>
              <ul className="dlSettleList">
                {suggestMinimalSettlements(balances.lines).map((s, i) => {
                  const nameOf = (id: string) =>
                    ledger?.members.find((m) => m.userId === id)?.displayName ?? id.slice(0, 8);
                  return (
                    <li key={`${s.fromUserId}-${s.toUserId}-${i}`}>
                      <span>
                        {nameOf(s.fromUserId)} → {nameOf(s.toUserId)}
                      </span>
                      <Amount irrMinor={s.amount.amountMinor} />
                    </li>
                  );
                })}
              </ul>
              {suggestMinimalSettlements(balances.lines).length === 0 ? (
                <EmptyHint>مانده‌ای برای تسویه نیست.</EmptyHint>
              ) : (
                <Link className="dlLinkBtn" href={`${hubPathFor("/workspaces")}#settlement-panel`}>
                  ثبت تسویه در مالی
                </Link>
              )}
            </div>
          </details>
        ) : null}

        <details className="reportDetails">
          <summary>
            <span>ورود CSV</span>
            <span>date,column,item,toman</span>
          </summary>
          <div className="reportDetails__body">
            <StatusLine>
              ستون: نام عضو یا <code>shared</code> · مبلغ به تومان · فقط روزهای غیرتعطیل
            </StatusLine>
            <textarea
              className="dlImportArea"
              rows={5}
              value={importCsv}
              onChange={(e) => setImportCsv(e.target.value)}
              placeholder={"2026-09-12,حمید,چای,5000\n2026-09-12,shared,نان,20000"}
            />
            <Button type="button" onClick={runImport} disabled={pending || !importCsv.trim()}>
              ورود به دفتر
            </Button>
          </div>
        </details>

        {!ledger && !error ? <EmptyHint>در حال بارگذاری دفتر…</EmptyHint> : null}

        {ledger ? (
          <>
            <StatusLine>
              {rangeHeadline(ledger.from, ledger.to, preset)} · خرج{" "}
              {ledger.source.expense === "postgres" ? "Postgres" : "حافظه"} · روزها{" "}
              {ledger.source.dayMeta === "postgres" ? "Postgres" : "حافظه"}
            </StatusLine>

            <div className="dlTrends">
              <h3 className="dlTrendsTitle">مصرف اعضا در بازه</h3>
              <ul className="pfTrendList">
                {ledger.members.map((m) => {
                  const minor = ledger.totals.members[m.userId]?.amountMinor ?? "0";
                  const pct = (Number(minor) / trendMax) * 100;
                  return (
                    <li key={m.userId}>
                      <div className="pfTrendMeta">
                        <span>{m.displayName}</span>
                        <Amount irrMinor={minor} />
                      </div>
                      <div
                        className="pfTrendBar"
                        style={{ width: `${Math.max(pct, minor === "0" ? 0 : 4)}%` }}
                        aria-hidden
                      />
                    </li>
                  );
                })}
                <li>
                  <div className="pfTrendMeta">
                    <span>هزینه مشترک</span>
                    <Amount irrMinor={ledger.totals.shared.amountMinor} />
                  </div>
                  <div
                    className="pfTrendBar dlTrendShared"
                    style={{
                      width: `${Math.max(
                        (Number(ledger.totals.shared.amountMinor) / trendMax) * 100,
                        ledger.totals.shared.amountMinor === "0" ? 0 : 4,
                      )}%`,
                    }}
                    aria-hidden
                  />
                </li>
              </ul>
            </div>

            <div className={viewMode === "cards" ? "dlCards" : "dlScroll"}>
              {viewMode === "cards" ? (
                <div className="dlCardList">
                  {ledger.days.map((row) => (
                    <article
                      key={row.date}
                      className={
                        row.isHoliday
                          ? "dlDayCard dlHoliday"
                          : row.isRangeLocked
                            ? "dlDayCard dlLocked"
                            : "dlDayCard"
                      }
                    >
                      <header>
                        <div>
                          <b>{formatJalaliIso(row.date)}</b>
                          {showGregorian ? (
                            <small className="dlGregorian">{row.date}</small>
                          ) : null}
                        </div>
                        <span className={row.weekday === 6 ? "dlWeekdayStart" : undefined}>
                          {weekdayFaSatFirst(row.weekday)}
                        </span>
                      </header>
                      {row.isHoliday || row.isRangeLocked ? (
                        <p className="dlMuted">
                          {row.isHoliday ? "تعطیل — ثبت قلم بسته است" : "قفل بازه — ثبت قلم بسته است"}
                        </p>
                      ) : (
                        <>
                          {ledger.members.map((m) => {
                            const cell = row.members[m.userId];
                            return (
                              <div key={m.userId} className="dlCardBlock">
                                <strong>{m.displayName}</strong>
                                {cell?.items.map((it) => (
                                  <div key={it.expenseId} className="dlItem">
                                    <div className="dlItemMain">
                                      <span className="dlItemTitle">{it.title}</span>
                                      <b className="dlItemAmt">{formatTomanMinor(it.amount.amountMinor)}</b>
                                    </div>
                                    <div className="dlItemActions">
                                      <button
                                        type="button"
                                        className="dlItemBtn"
                                        onClick={() =>
                                          openDraft(
                                            {
                                              kind: "member",
                                              date: row.date,
                                              userId: m.userId,
                                              displayName: m.displayName,
                                              expenseId: it.expenseId,
                                            },
                                            it,
                                          )
                                        }
                                      >
                                        ویرایش
                                      </button>
                                      <button
                                        type="button"
                                        className="dlItemBtn isDanger"
                                        onClick={() => deleteItem(it.expenseId)}
                                      >
                                        حذف
                                      </button>
                                    </div>
                                  </div>
                                ))}
                                <button
                                  type="button"
                                  className="dlAdd"
                                  onClick={() =>
                                    openDraft({
                                      kind: "member",
                                      date: row.date,
                                      userId: m.userId,
                                      displayName: m.displayName,
                                    })
                                  }
                                >
                                  + کالا
                                </button>
                              </div>
                            );
                          })}
                          <div className="dlCardBlock">
                            <strong>هزینه مشترک</strong>
                            {row.shared.items.map((it) => (
                              <div key={it.expenseId} className="dlItem">
                                <div className="dlItemMain">
                                  <span className="dlItemTitle">{it.title}</span>
                                  <b className="dlItemAmt">{formatTomanMinor(it.amount.amountMinor)}</b>
                                </div>
                                <div className="dlItemActions">
                                  <button
                                    type="button"
                                    className="dlItemBtn"
                                    onClick={() =>
                                      openDraft(
                                        {
                                          kind: "shared",
                                          date: row.date,
                                          expenseId: it.expenseId,
                                        },
                                        it,
                                      )
                                    }
                                  >
                                    ویرایش
                                  </button>
                                  <button
                                    type="button"
                                    className="dlItemBtn isDanger"
                                    onClick={() => deleteItem(it.expenseId)}
                                  >
                                    حذف
                                  </button>
                                </div>
                              </div>
                            ))}
                            <button
                              type="button"
                              className="dlAdd"
                              onClick={() => openDraft({ kind: "shared", date: row.date })}
                            >
                              + مشترک
                            </button>
                          </div>
                          <footer>
                            جمع: <Amount irrMinor={row.dayTotal.amountMinor} />
                          </footer>
                        </>
                      )}
                    </article>
                  ))}
                </div>
              ) : (
              <table className="dlTable">
                <thead>
                  <tr>
                    <th>ردیف</th>
                    <th>روز</th>
                    <th>تاریخ</th>
                    {ledger.members.map((m) => (
                      <th key={m.userId}>{m.displayName}</th>
                    ))}
                    <th>هزینه مشترک</th>
                    <th>جمع روز</th>
                    <th>توضیحات</th>
                    <th>وضعیت</th>
                  </tr>
                </thead>
                <tbody>
                  {ledger.days.map((row, idx) => {
                    const isSat = row.weekday === 6;
                    const isToday = row.date === todayIso;
                    return (
                    <tr
                      key={row.date}
                      className={
                        row.isHoliday
                          ? "dlHoliday"
                          : row.isRangeLocked
                            ? "dlLocked"
                            : isToday
                              ? "dlToday"
                              : isSat
                                ? "dlSat"
                                : idx % 2
                                  ? "dlAlt"
                                  : undefined
                      }
                    >
                      <td>{idx + 1}</td>
                      <td className="dlWeekday">
                        <span className={isSat ? "dlWeekdayStart" : undefined}>
                          {weekdayFaSatFirst(row.weekday)}
                        </span>
                        {isToday ? <small className="dlTodayBadge">امروز</small> : null}
                      </td>
                      <td className="dlDate">
                        <span className="dlJalali">{formatJalaliIso(row.date)}</span>
                        {showGregorian ? (
                          <small className="dlGregorian">{row.date}</small>
                        ) : null}
                        {row.isRangeLocked ? (
                          <small className="dlLockBadge">قفل</small>
                        ) : null}
                      </td>
                      {ledger.members.map((m) => {
                        const cell = row.members[m.userId];
                        return (
                          <td key={m.userId}>
                            {row.isHoliday || row.isRangeLocked ? (
                              <span className="dlMuted">
                                {row.isHoliday ? "تعطیل" : "قفل"}
                              </span>
                            ) : (
                              <div className="dlCell">
                                {cell?.items.map((it) => (
                                  <div key={it.expenseId} className="dlItem">
                                    <div className="dlItemMain">
                                      <span className="dlItemTitle">{it.title}</span>
                                      <b className="dlItemAmt">{formatTomanMinor(it.amount.amountMinor)}</b>
                                    </div>
                                    <div className="dlItemActions">
                                      <button
                                        type="button"
                                        className="dlItemBtn"
                                        onClick={() =>
                                          openDraft(
                                            {
                                              kind: "member",
                                              date: row.date,
                                              userId: m.userId,
                                              displayName: m.displayName,
                                              expenseId: it.expenseId,
                                            },
                                            it,
                                          )
                                        }
                                      >
                                        ویرایش
                                      </button>
                                      <button
                                        type="button"
                                        className="dlItemBtn isDanger"
                                        onClick={() => deleteItem(it.expenseId)}
                                      >
                                        حذف
                                      </button>
                                    </div>
                                  </div>
                                ))}
                                <button
                                  type="button"
                                  className="dlAdd"
                                  onClick={() =>
                                    openDraft({
                                      kind: "member",
                                      date: row.date,
                                      userId: m.userId,
                                      displayName: m.displayName,
                                    })
                                  }
                                >
                                  + کالا
                                </button>
                              </div>
                            )}
                          </td>
                        );
                      })}
                      <td>
                        {row.isHoliday || row.isRangeLocked ? (
                          <span className="dlMuted">
                            {row.isHoliday ? "تعطیل" : "قفل"}
                          </span>
                        ) : (
                          <div className="dlCell">
                            {row.shared.items.map((it) => (
                              <div key={it.expenseId} className="dlItem">
                                <div className="dlItemMain">
                                  <span className="dlItemTitle">{it.title}</span>
                                  <b className="dlItemAmt">{formatTomanMinor(it.amount.amountMinor)}</b>
                                </div>
                                <div className="dlItemActions">
                                  <button
                                    type="button"
                                    className="dlItemBtn"
                                    onClick={() =>
                                      openDraft(
                                        {
                                          kind: "shared",
                                          date: row.date,
                                          expenseId: it.expenseId,
                                        },
                                        it,
                                      )
                                    }
                                  >
                                    ویرایش
                                  </button>
                                  <button
                                    type="button"
                                    className="dlItemBtn isDanger"
                                    onClick={() => deleteItem(it.expenseId)}
                                  >
                                    حذف
                                  </button>
                                </div>
                              </div>
                            ))}
                            <button
                              type="button"
                              className="dlAdd"
                              onClick={() =>
                                openDraft({
                                  kind: "shared",
                                  date: row.date,
                                })
                              }
                            >
                              + مشترک
                            </button>
                          </div>
                        )}
                      </td>
                      <td className="dlTotal">
                        {row.isHoliday ? (
                          "—"
                        ) : (
                          <Amount irrMinor={row.dayTotal.amountMinor} />
                        )}
                      </td>
                      <td>
                        <button
                          type="button"
                          className="dlNoteBtn"
                          onClick={() =>
                            setDayNote({ date: row.date, note: row.note ?? "" })
                          }
                        >
                          {row.note?.trim() || (row.isHoliday ? "تعطیل" : "…")}
                        </button>
                      </td>
                      <td>
                        <button
                          type="button"
                          className="dlHolidayBtn"
                          onClick={() => toggleHoliday(row.date, row.isHoliday)}
                          disabled={pending}
                        >
                          {row.isHoliday ? (
                            <StatusPill tone="warn">تعطیل — کلیک برای عادی</StatusPill>
                          ) : (
                            <span className="dlStatusNormal">عادی — کلیک برای تعطیل</span>
                          )}
                        </button>
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={3}>جمع بازه ({ledger.days.length} روز)</td>
                    {ledger.members.map((m) => (
                      <td key={m.userId}>
                        <Amount irrMinor={ledger.totals.members[m.userId]?.amountMinor ?? "0"} />
                      </td>
                    ))}
                    <td>
                      <Amount irrMinor={ledger.totals.shared.amountMinor} />
                    </td>
                    <td>
                      <Amount irrMinor={ledger.totals.grand.amountMinor} />
                    </td>
                    <td colSpan={2} />
                  </tr>
                </tfoot>
              </table>
              )}
            </div>
          </>
        ) : null}
        </div>

        {draft ? (
          <div
            className="dlOverlay"
            role="presentation"
            onClick={(e) => {
              if (e.target === e.currentTarget) setDraft(null);
            }}
          >
            <div className="dlModal" role="dialog" aria-modal="true" aria-label={draft.expenseId ? "ویرایش کالا" : "افزودن کالا"}>
              <h3>{draft.expenseId ? "ویرایش قلم" : "افزودن قلم"}</h3>
              <JalaliDateField label="تاریخ" value={draftDate} onChange={setDraftDate} />
              <SelectField
                label="ستون"
                value={draftColumn}
                onChange={(e) => setDraftColumn(e.target.value)}
              >
                <option value="shared">هزینه مشترک</option>
                {(ledger?.members ?? []).map((m) => (
                  <option key={m.userId} value={m.userId}>
                    {m.displayName}
                  </option>
                ))}
              </SelectField>
              <TextField
                label="نام کالا"
                value={itemName}
                onChange={(e) => setItemName(e.target.value)}
                placeholder="مثلاً لیموناد بطری"
              />
              <TextField
                label="مبلغ (تومان)"
                value={itemToman}
                onChange={(e) => setItemToman(e.target.value)}
                placeholder="60000"
              />
              <div className="dlModalActions">
                <Button type="button" onClick={submitEntry} disabled={pending}>
                  {draft.expenseId ? "ذخیره" : "ثبت"}
                </Button>
                <Button type="button" onClick={() => setDraft(null)}>
                  انصراف
                </Button>
              </div>
            </div>
          </div>
        ) : null}

        {dayNote ? (
          <div
            className="dlOverlay"
            role="presentation"
            onClick={(e) => {
              if (e.target === e.currentTarget) setDayNote(null);
            }}
          >
            <div className="dlModal" role="dialog" aria-modal="true" aria-label="توضیح روز">
              <h3>توضیحات {formatJalaliIso(dayNote.date)}</h3>
              <TextField
                label="یادداشت"
                value={dayNote.note}
                onChange={(e) => setDayNote({ ...dayNote, note: e.target.value })}
              />
              <div className="dlModalActions">
                <Button type="button" onClick={saveDayNote} disabled={pending}>
                  ذخیره
                </Button>
                <Button type="button" onClick={() => setDayNote(null)}>
                  انصراف
                </Button>
              </div>
            </div>
          </div>
        ) : null}
      </FormStack>
    </SectionCard>
  );
}
