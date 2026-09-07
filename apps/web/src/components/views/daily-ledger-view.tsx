"use client";

import { newClientId } from "@/lib/id";

import { useEffect, useState, useTransition } from "react";
import {
  formatJalaliIso,
  isReadOnlyRole,
  resolveDailyLedgerRange,
  shiftDailyLedgerRange,
} from "@dang/contracts";
import type {
  DailyLedgerItem,
  DailyLedgerRangePreset,
  DailyLedgerResponse,
  MembershipSummary,
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
} from "@/components/ui-blocks";
import { api } from "@/lib/api";
import { friendlyErrorMessage } from "@/lib/api-errors";
import { tomanInputToIrrMinor } from "@/lib/irr-money";
import { membershipRoleLabel } from "@/lib/status-labels";
import { useAppChrome } from "@/lib/use-app-chrome";
import { useOptionalWorkspaceScope } from "@/components/shell/workspace-scope";
import { useIsNarrow } from "@/lib/use-viewport";
import { DailyLedgerLockPanel } from "@/components/views/daily-ledger/daily-ledger-lock-panel";
import { DailyLedgerToolbar } from "@/components/views/daily-ledger/daily-ledger-toolbar";
import { DailyLedgerGrid } from "@/components/views/daily-ledger/daily-ledger-grid";
import { DailyLedgerSidePanels } from "@/components/views/daily-ledger/daily-ledger-side-panels";
import {
  dayItemCount,
  rangeHeadline,
  todayIsoLocal,
  type DraftTarget,
} from "@/components/views/daily-ledger/daily-ledger-utils";

/** Professional day×member consumption ledger — API-backed only. */
export function DailyLedgerView() {
  const chrome = useAppChrome();
  const scope = useOptionalWorkspaceScope();
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
  const [myRole, setMyRole] = useState("");
  const todayIso = todayIsoLocal();
  const readOnly = isReadOnlyRole(myRole);

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
    const usable = chrome.workspaces.filter((w) => w.template !== "personal");
    setWorkspaces(usable);
    const selected =
      usable.find((w) => w.id === (scope?.workspaceId || chrome.workspaceId))?.id ??
      usable[0]?.id ??
      "";
    setWorkspaceId(selected);
  }, [chrome.ready, chrome.workspaceId, chrome.workspaces, scope?.workspaceId]);

  useEffect(() => {
    if (!workspaceId) {
      setMyRole("");
      return;
    }
    void Promise.all([api.listMembers(workspaceId), api.me()])
      .then(([members, me]: [MembershipSummary[], { actor: { userId: string } }]) => {
        setMyRole(members.find((m) => m.userId === me.actor.userId)?.role ?? "");
      })
      .catch(() => setMyRole(""));
  }, [workspaceId]);

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
    if (readOnly) return;
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
              idempotencyKey: newClientId(),
            });
          } else {
            await api.createDailyLedgerEntry(workspaceId, {
              date: draftDate,
              itemName: itemName.trim(),
              amount,
              memberUserId,
              idempotencyKey: newClientId(),
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
            idempotencyKey: newClientId(),
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
            idempotencyKey: newClientId(),
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
          <DailyLedgerToolbar
            workspaces={workspaces}
            workspaceId={workspaceId}
            onWorkspaceChange={setWorkspaceId}
            preset={preset}
            from={from}
            to={to}
            daysCount={daysCount}
            showCustomRange={showCustomRange}
            viewMode={viewMode}
            showGregorian={showGregorian}
            pending={pending}
            hasLedger={!!ledger}
            onShiftPeriod={shiftPeriod}
            onGoToday={goTodayPeriod}
            onApplyPreset={applyPreset}
            onApplyDaysCount={applyDaysCount}
            onToggleCustomRange={() => setShowCustomRange((v) => !v)}
            onCustomFrom={(iso) => {
              setPreset("custom");
              setFrom(iso);
            }}
            onCustomTo={(iso) => {
              setPreset("custom");
              setTo(iso);
            }}
            onApplyCustom={load}
            onSelectViewMode={(mode) => {
              setViewModeTouched(true);
              setViewMode(mode);
            }}
            onToggleGregorian={() => setShowGregorian((v) => !v)}
            onExportCsv={exportCsv}
          />

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
          <DailyLedgerLockPanel
            rangeLocks={ledger.rangeLocks}
            from={from}
            to={to}
            lockReason={lockReason}
            onLockReasonChange={setLockReason}
            onLockRange={lockRange}
            onUnlock={unlockLock}
            pending={pending}
          />
        ) : null}

        <DailyLedgerSidePanels
          balances={balances}
          members={ledger?.members ?? []}
          importCsv={importCsv}
          onImportCsvChange={setImportCsv}
          onRunImport={runImport}
          pending={pending}
          readOnly={readOnly}
        />

        {!ledger && !error ? <EmptyHint loading>در حال بارگذاری دفتر…</EmptyHint> : null}

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

            <DailyLedgerGrid
              ledger={ledger}
              viewMode={viewMode}
              showGregorian={showGregorian}
              todayIso={todayIso}
              pending={pending}
              readOnly={readOnly}
              onOpenDraft={openDraft}
              onDeleteItem={deleteItem}
              onToggleHoliday={toggleHoliday}
              onEditNote={(date, note) => setDayNote({ date, note })}
            />
          </>
        ) : null}
        </div>

        {readOnly ? (
          <StatusLine>
            نقش {membershipRoleLabel(myRole)} فقط مشاهده دارد — ثبت/ویرایش قلم و CSV فعال نیست.
          </StatusLine>
        ) : null}

        {draft && !readOnly ? (
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
