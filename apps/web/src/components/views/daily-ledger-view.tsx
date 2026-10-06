"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { newClientId } from "@/lib/id";

import { useEffect, useState, useTransition, type ReactNode } from "react";
import {
  formatJalaliIso,
  isReadOnlyRole,
  resolveDailyLedgerRange,
  shiftDailyLedgerRange,
  sumDayFundDeposits,
} from "@dang/contracts";
import type {
  DailyLedgerItem,
  DailyLedgerRangePreset,
  DailyLedgerResponse,
  MembershipSummary,
  PettyCashFundSummary,
  WorkspaceBalancesResponse,
  WorkspaceSummary,
} from "@dang/contracts";
import { Amount, Button, SelectField, TextField } from "@dang/ui";
import { WorkspacePageFrame } from "@/components/shell/workspace-page-frame";
import { JalaliDateField } from "@/components/jalali-date-field";
import {
  EmptyHint,
  FormStack,
  SectionCard,
  StatusLine,
} from "@/components/ui-blocks";
import { ContentSkeleton } from "@/components/shell/content-skeleton";
import { api } from "@/lib/api";
import { friendlyErrorMessage } from "@/lib/api-errors";
import { hubPathFor } from "@/lib/hub-links";
import { useLiveInvalidation } from "@/lib/live-invalidation";
import { displayInputToIrrMinor, irrMinorToDisplayInput } from "@/lib/irr-money";
import { useDisplayUnit } from "@/lib/display-unit";
import { moneyFieldLabel, moneyUnitSuffix } from "@/lib/money-labels";
import { membershipRoleLabel } from "@/lib/status-labels";
import { NAV_LABELS } from "@/lib/nav-labels";
import { useAppChrome } from "@/lib/use-app-chrome";
import { useOptionalWorkspaceScope } from "@/components/shell/workspace-scope";
import { FlashMessages } from "@/lib/use-flash-message";
import { DailyLedgerLockPanel } from "@/components/views/daily-ledger/daily-ledger-lock-panel";
import { DailyLedgerToolbar } from "@/components/views/daily-ledger/daily-ledger-toolbar";
import { DailyLedgerOverviewTable } from "@/components/views/daily-ledger/daily-ledger-overview-table";
import { DailyLedgerDayView } from "@/components/views/daily-ledger/daily-ledger-day-view";
import { DailyLedgerSidePanels } from "@/components/views/daily-ledger/daily-ledger-side-panels";
import { DailyLedgerModal } from "@/components/views/daily-ledger/daily-ledger-modal";
import { CatalogPicker } from "@/components/catalog-picker";
import {
  dayItemCount,
  adjacentLedgerDates,
  lastIndividualMemberKey,
  preferIndividualMemberUserId,
  projectDepositNetMinor,
  projectFundBalanceAfterDeposit,
  rangeHeadline,
  todayIsoLocal,
  type DraftTarget,
} from "@/components/views/daily-ledger/daily-ledger-utils";
import { wPath } from "@/lib/workspace-paths";
import styles from "./daily-ledger-view.module.css";

/** Professional consumption ledger — range overview ↔ day detail (?date=). */
export function DailyLedgerView() {
  const chrome = useAppChrome();
  const displayUnit = useDisplayUnit();
  const unitLabel = moneyUnitSuffix(displayUnit);
  const scope = useOptionalWorkspaceScope();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[]>([]);
  const [workspaceId, setWorkspaceId] = useState("");
  const [preset, setPreset] = useState<DailyLedgerRangePreset>("week");
  const [from, setFrom] = useState(() => resolveDailyLedgerRange("week").from);
  const [to, setTo] = useState(() => resolveDailyLedgerRange("week").to);
  const [daysCount, setDaysCount] = useState(7);
  const [ledger, setLedger] = useState<DailyLedgerResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [draft, setDraft] = useState<DraftTarget | null>(null);
  const [draftDate, setDraftDate] = useState("");
  const [draftColumn, setDraftColumn] = useState<string>("shared");
  const [itemName, setItemName] = useState("");
  const [itemToman, setItemToman] = useState("");
  /** Line quantity — always editable in the add/edit modal (default 1). */
  const [itemQuantity, setItemQuantity] = useState("1");
  /** Unit price in display units; total = quantity × unit price. */
  const [itemUnitToman, setItemUnitToman] = useState("");
  const [draftCatalog, setDraftCatalog] = useState<{
    catalogItemId: string;
    unitCode: string;
    quantity: number;
    unitPriceMinor: string;
  } | null>(null);
  const [fundingSourceKind, setFundingSourceKind] = useState<"personal" | "petty_cash">(
    "personal",
  );
  const [fundingRefId, setFundingRefId] = useState("");
  const [pettyFunds, setPettyFunds] = useState<PettyCashFundSummary[]>([]);
  const [depositDate, setDepositDate] = useState<string | null>(null);
  const [depositToman, setDepositToman] = useState("");
  const [depositFundId, setDepositFundId] = useState("");
  const [depositCashInBy, setDepositCashInBy] = useState("");
  const [depositMode, setDepositMode] = useState<"balance" | "gift">("balance");
  const [depositNote, setDepositNote] = useState("");
  const [dayNote, setDayNote] = useState<{ date: string; note: string } | null>(null);
  const [importCsv, setImportCsv] = useState("");
  const [, setPendingImport] = useState<{
    paste?: string;
    xlsxBase64?: string;
  } | null>(null);
  const [unmappedColumns, setUnmappedColumns] = useState<string[]>([]);
  const [columnMap, setColumnMap] = useState<Record<string, string>>({});
  const [importPreview, setImportPreview] = useState<
    Array<{
      date: string;
      column: string;
      itemName: string;
      amountToman: number;
      resolved: string;
    }>
  >([]);
  const [sheetSource, setSheetSource] = useState<"auto" | "master" | "members">(
    "auto",
  );
  const [info, setInfo] = useState<string | null>(null);
  const [showTip, setShowTip] = useState(false);
  const [balances, setBalances] = useState<WorkspaceBalancesResponse | null>(null);
  const [lockReason, setLockReason] = useState("");
  const [showCustomRange, setShowCustomRange] = useState(false);
  const [myRole, setMyRole] = useState("");
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [lastMemberUserId, setLastMemberUserId] = useState<string | null>(null);
  const todayIso = todayIsoLocal();
  const readOnly = isReadOnlyRole(myRole);

  const dateFromUrl = searchParams.get("date");
  const selectedDate =
    dateFromUrl && /^\d{4}-\d{2}-\d{2}$/.test(dateFromUrl) ? dateFromUrl : null;

  function setDateQuery(next: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (next) params.set("date", next);
    else params.delete("date");
    const q = params.toString();
    router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false });
  }

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
      setMyUserId(null);
      setLastMemberUserId(null);
      return;
    }
    if (typeof window !== "undefined") {
      setLastMemberUserId(
        window.sessionStorage.getItem(lastIndividualMemberKey(workspaceId)),
      );
    }
    void Promise.all([api.listMembers(workspaceId), api.me()])
      .then(([members, me]: [MembershipSummary[], { actor: { userId: string } }]) => {
        setMyUserId(me.actor.userId);
        setMyRole(members.find((m) => m.userId === me.actor.userId)?.role ?? "");
      })
      .catch(() => {
        setMyRole("");
        setMyUserId(null);
      });
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
    if (!draft && !dayNote && !depositDate) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setDraft(null);
        setDraftCatalog(null);
        setDayNote(null);
        setDepositDate(null);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [draft, dayNote, depositDate]);

  function load() {
    if (!workspaceId) return;
    startTransition(() => {
      void (async () => {
        try {
          const [data, balResult, funds] = await Promise.all([
            api.dailyLedger(workspaceId, { from, to, preset: "custom" }),
            api.getBalances(workspaceId).then(
              (bal) => ({ ok: true as const, bal }),
              (err: unknown) => ({ ok: false as const, err }),
            ),
            api.listPettyCash(workspaceId).catch(() => [] as PettyCashFundSummary[]),
          ]);
          setLedger(data);
          if (balResult.ok) {
            setBalances(balResult.bal);
          } else {
            setBalances(null);
            const msg = friendlyErrorMessage(balResult.err, "بارگذاری مانده ناموفق");
            setError(
              /۵۰۰|500|occurred|schema|migration|مهاجرت/i.test(msg)
                ? "مانده‌ها در دسترس نیست — احتمالاً دیتابیس عقب است. بعداً «تلاش دوباره» بزنید."
                : msg,
            );
          }
          setPettyFunds(funds.filter((f) => f.active));
          if (balResult.ok) setError(null);
          chrome.selectWorkspace(workspaceId);
        } catch (err: unknown) {
          const msg = friendlyErrorMessage(err, "بارگذاری دفتر روزانه ناموفق");
          setError(
            /۵۰۰|500|occurred|schema|migration|مهاجرت/i.test(msg)
              ? "بارگذاری دفتر ناموفق — دیتابیس ممکن است عقب باشد. صفحه را تازه کنید یا دوباره تلاش کنید."
              : msg,
          );
        }
      })();
    });
  }

  useEffect(() => {
    if (!chrome.ready || !workspaceId) return;
    load();
  }, [chrome.ready, workspaceId, from, to]);

  // Someone else's expense or settlement changes this grid and the balances
  // beside it, so the server tells us to reload instead of us polling.
  useLiveInvalidation(["expenses", "balances", "settlements", "payments"], () => {
    if (!chrome.ready || !workspaceId) return;
    load();
  });

  function openDraft(target: DraftTarget, item?: DailyLedgerItem) {
    if (readOnly) return;
    if (target.kind === "member" && workspaceId) {
      setLastMemberUserId(target.userId);
      if (typeof window !== "undefined") {
        window.sessionStorage.setItem(
          lastIndividualMemberKey(workspaceId),
          target.userId,
        );
      }
    }
    setDraft(target);
    setDraftDate(target.date);
    setDraftColumn(target.kind === "member" ? target.userId : "shared");
    setItemName(item?.title ?? "");
    const qty = item?.quantity && item.quantity > 0 ? item.quantity : 1;
    setItemQuantity(String(qty));
    const unitMinor =
      item?.unitPriceMinor && /^\d+$/.test(item.unitPriceMinor)
        ? item.unitPriceMinor
        : item
          ? String(Math.round(Number(item.amount.amountMinor) / qty))
          : "";
    setItemUnitToman(
      unitMinor ? irrMinorToDisplayInput(unitMinor, displayUnit) : "",
    );
    setItemToman(
      item ? irrMinorToDisplayInput(item.amount.amountMinor, displayUnit) : "",
    );
    setDraftCatalog(
      item?.catalogItemId
        ? {
            catalogItemId: item.catalogItemId,
            unitCode: item.unitCode ?? "piece",
            quantity: qty,
            unitPriceMinor: unitMinor || item.amount.amountMinor,
          }
        : null,
    );
    if (item?.fundingSourceKind === "petty_cash" && item.fundingRefId) {
      setFundingSourceKind("petty_cash");
      setFundingRefId(item.fundingRefId);
    } else {
      setFundingSourceKind("personal");
      setFundingRefId(pettyFunds[0]?.id ?? "");
    }
  }

  function syncLineTotalFromUnit(qtyRaw: string, unitRaw: string) {
    const qty = Number(String(qtyRaw).replaceAll(",", "").trim());
    const unitMoney = displayInputToIrrMinor(unitRaw, displayUnit);
    if (!Number.isFinite(qty) || qty <= 0 || !unitMoney) {
      setItemToman("");
      return;
    }
    const totalMinor = String(Math.round(qty * Number(unitMoney.amountMinor)));
    setItemToman(irrMinorToDisplayInput(totalMinor, displayUnit));
  }

  function parseDraftQuantity(): number | null {
    const qty = Number(String(itemQuantity).replaceAll(",", "").trim());
    if (!Number.isFinite(qty) || qty <= 0 || qty > 1_000_000) return null;
    return qty;
  }

  function openDeposit(date: string) {
    if (readOnly) return;
    if (!pettyFunds.length) {
      setError("ابتدا یک صندوق تنخواه در بخش پرداخت‌ها بسازید");
      return;
    }
    const preferredCashIn = preferIndividualMemberUserId(ledger?.members ?? [], {
      preferUserId: myUserId,
      lastUserId: lastMemberUserId,
    });
    setError(null);
    setDepositDate(date);
    setDepositToman("");
    setDepositFundId(pettyFunds[0]?.id ?? "");
    setDepositCashInBy(preferredCashIn ?? "");
    setDepositMode("balance");
    setDepositNote("");
  }

  function openDay(date: string) {
    setDateQuery(date);
  }

  function closeDay() {
    setDateQuery(null);
  }

  function submitEntry() {
    if (!workspaceId || !draft) return;
    const qty = parseDraftQuantity();
    if (qty == null) {
      setError("تعداد باید عدد مثبت باشد");
      return;
    }
    const unitMoney = displayInputToIrrMinor(itemUnitToman, displayUnit);
    const amount =
      unitMoney != null
        ? {
            amountMinor: String(Math.round(qty * Number(unitMoney.amountMinor))),
            currency: "IRR" as const,
          }
        : displayInputToIrrMinor(itemToman, displayUnit);
    if (!itemName.trim() || !amount) {
      setError(`نام کالا و مبلغ واحد (${unitLabel}) لازم است`);
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(draftDate)) {
      setError("تاریخ شمسی را انتخاب کنید");
      return;
    }
    const memberUserId = draftColumn === "shared" ? null : draftColumn;
    const resolvedUnitPriceMinor =
      unitMoney?.amountMinor ??
      (qty === 1
        ? amount.amountMinor
        : String(Math.round(Number(amount.amountMinor) / qty)));
    const qtyFields = {
      quantity: qty,
      unitPriceMinor: resolvedUnitPriceMinor,
    };
    const catalogFields = draftCatalog
      ? {
          catalogItemId: draftCatalog.catalogItemId,
          unitCode: draftCatalog.unitCode,
          ...qtyFields,
        }
      : qtyFields;
    if (fundingSourceKind === "petty_cash" && !fundingRefId.trim()) {
      setError("برای خرج از تنخواه، صندوق را انتخاب کنید");
      return;
    }
    const fundingFields =
      fundingSourceKind === "petty_cash" && fundingRefId.trim()
        ? {
            fundingSourceKind: "petty_cash" as const,
            fundingRefId: fundingRefId.trim(),
          }
        : { fundingSourceKind: "personal" as const };
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
              ...catalogFields,
              ...fundingFields,
            });
          } else {
            await api.createDailyLedgerEntry(workspaceId, {
              date: draftDate,
              itemName: itemName.trim(),
              amount,
              memberUserId,
              idempotencyKey: newClientId(),
              ...catalogFields,
              ...fundingFields,
            });
          }
          setDraft(null);
          setDraftCatalog(null);
          setItemQuantity("1");
          setItemUnitToman("");
          setError(null);
          load();
        } catch (err: unknown) {
          setError(friendlyErrorMessage(err, draft.expenseId ? "ویرایش قلم ناموفق" : "ثبت قلم ناموفق"));
        }
      })();
    });
  }

  function submitDeposit() {
    if (!workspaceId || !depositDate) return;
    const amount = displayInputToIrrMinor(depositToman, displayUnit);
    if (!amount) {
      setError(`مبلغ واریز (${unitLabel}) لازم است`);
      return;
    }
    if (!depositFundId.trim()) {
      setError("صندوق تنخواه را انتخاب کنید");
      return;
    }
    startTransition(() => {
      void (async () => {
        try {
          await api.createDailyLedgerDeposit(workspaceId, {
            date: depositDate,
            amountMinor: amount.amountMinor,
            fundId: depositFundId.trim(),
            cashInByUserId: depositCashInBy.trim() || undefined,
            mode: depositMode,
            note: depositNote.trim() || undefined,
            idempotencyKey: newClientId(),
          });
          setDepositDate(null);
          setError(null);
          setInfo(
            depositMode === "gift"
              ? "هدیه به صندوق ثبت شد"
              : "واریز ثبت شد — اعتبار واریزکننده در مانده اعمال شد",
          );
          load();
        } catch (err: unknown) {
          setError(friendlyErrorMessage(err, "ثبت واریز به صندوق ناموفق"));
        }
      })();
    });
  }

  function deleteItem(expenseId: string, options?: { skipConfirm?: boolean }) {
    if (!workspaceId) return;
    if (!options?.skipConfirm && !window.confirm("این قلم ابطال شود؟")) return;
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
    const paste = importCsv;
    startTransition(() => {
      void (async () => {
        try {
          const result = await api.importDailyLedgerCsv(workspaceId, {
            paste,
            previewOnly: true,
            columnMap: Object.keys(columnMap).length ? columnMap : undefined,
            idempotencyKey: newClientId(),
          });
          setPendingImport({ paste });
          setImportPreview(result.preview ?? []);
          if (result.unmappedColumns && result.unmappedColumns.length > 0) {
            setUnmappedColumns(result.unmappedColumns);
            setColumnMap((prev) => {
              const next = { ...prev };
              for (const c of result.unmappedColumns!) {
                if (!next[c]) next[c] = "";
              }
              return next;
            });
            setInfo(
              `پیش‌نمایش: ${result.preview?.length ?? 0} قلم · نگاشت ${result.unmappedColumns.length} ستون لازم است`,
            );
          } else {
            setUnmappedColumns([]);
            setInfo(
              `پیش‌نمایش آماده: ${(result.preview ?? []).length} قلم — «تأیید ورود» را بزنید`,
            );
          }
          setError(null);
        } catch (err: unknown) {
          setError(friendlyErrorMessage(err, "پیش‌نمایش CSV ناموفق"));
        }
      })();
    });
  }

  function runImportXlsx(file: File) {
    if (!workspaceId) return;
    startTransition(() => {
      void (async () => {
        try {
          const buf = await file.arrayBuffer();
          const bytes = new Uint8Array(buf);
          let binary = "";
          for (let i = 0; i < bytes.length; i += 1) {
            binary += String.fromCharCode(bytes[i]!);
          }
          const xlsxBase64 = btoa(binary);
          const result = await api.importDailyLedgerCsv(workspaceId, {
            xlsxBase64,
            previewOnly: true,
            sheetSource,
            columnMap: Object.keys(columnMap).length ? columnMap : undefined,
            idempotencyKey: newClientId(),
          });
          setPendingImport({ xlsxBase64 });
          setImportPreview(result.preview ?? []);
          if (result.unmappedColumns && result.unmappedColumns.length > 0) {
            setUnmappedColumns(result.unmappedColumns);
            setColumnMap((prev) => {
              const next = { ...prev };
              for (const c of result.unmappedColumns!) {
                if (!next[c]) next[c] = "";
              }
              return next;
            });
            setInfo(
              `پیش‌نمایش Excel: ${result.preview?.length ?? 0} قلم · نگاشت ${result.unmappedColumns.length} ستون لازم است`,
            );
          } else {
            setUnmappedColumns([]);
            setInfo(
              `پیش‌نمایش Excel آماده: ${(result.preview ?? []).length} قلم — «تأیید ورود» را بزنید`,
            );
          }
          setError(null);
        } catch (err: unknown) {
          setError(friendlyErrorMessage(err, "پیش‌نمایش فایل Excel ناموفق"));
        }
      })();
    });
  }

  function confirmMappedImport() {
    if (!workspaceId) return;
    if (importPreview.length === 0) {
      setError("ابتدا پیش‌نمایش بگیرید");
      return;
    }
    const incomplete = unmappedColumns.some((c) => !columnMap[c]?.trim());
    if (incomplete) {
      setError("برای همهٔ ستون‌های ناشناس نگاشت انتخاب کنید");
      return;
    }
    startTransition(() => {
      void (async () => {
        try {
          const result = await api.importDailyLedgerCsv(workspaceId, {
            rows: importPreview.map((r) => ({
              date: r.date,
              column: r.column,
              itemName: r.itemName,
              amountToman: r.amountToman,
            })),
            sheetSource,
            columnMap: Object.keys(columnMap).length ? columnMap : undefined,
            previewOnly: false,
            idempotencyKey: newClientId(),
          });
          if (result.unmappedColumns && result.unmappedColumns.length > 0) {
            setUnmappedColumns(result.unmappedColumns);
            setImportPreview(result.preview ?? importPreview);
            setInfo(
              `هنوز نگاشت ناقص است: ${result.unmappedColumns.join("، ")}`,
            );
            return;
          }
          const warn =
            result.warnings && result.warnings.length > 0
              ? ` · هشدار: ${result.warnings.slice(0, 3).join("؛ ")}`
              : "";
          setInfo(
            `ورود: ${result.imported} قلم · رد شده: ${result.skipped}` +
              (result.holidays ? ` · تعطیل: ${result.holidays}` : "") +
              warn,
          );
          setImportCsv("");
          setPendingImport(null);
          setUnmappedColumns([]);
          setColumnMap({});
          setImportPreview([]);
          setError(null);
          load();
        } catch (err: unknown) {
          setError(friendlyErrorMessage(err, "ورود با نگاشت ناموفق"));
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
  const selectedDay =
    ledger && selectedDate
      ? (ledger.days.find((day) => day.date === selectedDate) ?? null)
      : null;
  const selectedWorkspace = workspaces.find((workspace) => workspace.id === workspaceId);
  const settlementsHref = selectedWorkspace
    ? wPath(selectedWorkspace.slug, "settlements")
    : `${hubPathFor("/workspaces")}#settlement-panel`;
  const fundNameById = Object.fromEntries(pettyFunds.map((f) => [f.id, f.name]));
  const canDeposit = pettyFunds.length > 0;
  const dayNeighbors =
    ledger && selectedDate ? adjacentLedgerDates(ledger, selectedDate) : { prev: null, next: null };
  const prevDayMeta =
    ledger && dayNeighbors.prev
      ? (() => {
          const row = ledger.days.find((d) => d.date === dayNeighbors.prev);
          return row ? { date: row.date, weekday: row.weekday } : null;
        })()
      : null;
  const nextDayMeta =
    ledger && dayNeighbors.next
      ? (() => {
          const row = ledger.days.find((d) => d.date === dayNeighbors.next);
          return row ? { date: row.date, weekday: row.weekday } : null;
        })()
      : null;
  const todayInRange = Boolean(ledger?.days.some((d) => d.date === todayIso));
  const dayClosed = Boolean(
    selectedDay && (selectedDay.isHoliday || selectedDay.isRangeLocked),
  );
  const expensesHref = selectedWorkspace
    ? wPath(selectedWorkspace.slug, "expenses")
    : null;
  const canAddLedgerItem = Boolean(selectedDay && !readOnly && !dayClosed);
  const primaryAction = (() => {
    if (canAddLedgerItem && selectedDay) {
      return (
        <Button
          type="button"
          onClick={() => openDraft({ kind: "shared", date: selectedDay.date })}
          disabled={pending}
        >
          ثبت قلم
        </Button>
      );
    }
    if (!selectedDay && selectedWorkspace && todayInRange) {
      return (
        <Button type="button" onClick={() => openDay(todayIso)} disabled={pending}>
          امروز را باز کن
        </Button>
      );
    }
    return expensesHref ? (
      <Link href={`${expensesHref}?from=ledger#quick-expense`}>
        {NAV_LABELS.fullExpense}
      </Link>
    ) : null;
  })();
  const secondaryActions = (() => {
    const parts: ReactNode[] = [];
    // Only when primary is «ثبت قلم» — avoid duplicating the expenses link.
    if (canAddLedgerItem && expensesHref) {
      parts.push(
        <Link key="expenses" href={`${expensesHref}?from=ledger#quick-expense`}>
          {NAV_LABELS.fullExpense}
        </Link>,
      );
    }
    if (error) {
      parts.push(
        <Button
          key="retry"
          type="button"
          variant="secondary"
          onClick={() => load()}
          disabled={pending}
        >
          تلاش دوباره
        </Button>,
      );
    }
    if (parts.length === 0) return null;
    return <>{parts}</>;
  })();

  const depositAmountMoney = displayInputToIrrMinor(depositToman, displayUnit);
  const depositMember = (ledger?.members ?? []).find((m) => m.userId === depositCashInBy);
  const depositMemberNet =
    balances?.lines.find((l) => l.userId === depositCashInBy)?.net.amountMinor ?? "0";
  const depositProjectedNet = depositAmountMoney
    ? projectDepositNetMinor(
        depositMemberNet,
        depositAmountMoney.amountMinor,
        depositMode,
      )
    : depositMemberNet;
  const selectedFund = pettyFunds.find((f) => f.id === depositFundId);
  const fundAfterDeposit = depositAmountMoney
    ? projectFundBalanceAfterDeposit(
        selectedFund?.balanceMinor ?? "0",
        depositAmountMoney.amountMinor,
      )
    : selectedFund?.balanceMinor ?? "0";

  useEffect(() => {
    if (!ledger || !selectedDate) return;
    if (!ledger.days.some((d) => d.date === selectedDate)) {
      setDateQuery(null);
    }
  }, [ledger, selectedDate]);

  return (
    <WorkspacePageFrame
      title={NAV_LABELS.ledger}
      description={
        selectedDay
          ? `جزئیات ${formatJalaliIso(selectedDay.date)} — ${NAV_LABELS.dailyEntry} و واریز؛ ${NAV_LABELS.fullExpense} همان روز فقط‌خواندنی.`
          : `${NAV_LABELS.dailyEntry} برای مصرف تکراری؛ برای تقسیم و جزئیات از ${NAV_LABELS.fullExpense} استفاده کنید.`
      }
      primaryAction={primaryAction}
      secondaryActions={secondaryActions}
      state="ready"
    >
      <>
      <FlashMessages error={error} successMessage={info} />
      <SectionCard
        title={selectedDay ? "جزئیات روز" : "دفتر روزانه گروه"}
        tone={selectedDay ? "quiet" : "default"}
        delayClass="delay1"
        className={selectedDay ? styles.dayModeCard : undefined}
      >
      <FormStack>
        {!selectedDay ? (
          <p className="liveHint">
            خلاصهٔ بازه را ببینید؛ برای ثبت و ویرایش روی «جزئیات» همان روز بزنید.
            واریز به صندوق جدا از جمع مصرف است. مدیریت صندوق‌ها در{" "}
            {selectedWorkspace ? (
              <Link href={wPath(selectedWorkspace.slug, "payments")}>پرداخت‌ها / تنخواه</Link>
            ) : (
              "پرداخت‌ها"
            )}
            .
          </p>
        ) : null}
        {!selectedDay && showTip ? (
          <div className="dlOnboard" role="note">
            <b>شروع سریع {NAV_LABELS.dailyEntry}</b>
            <ol>
              <li>با دکمه‌های ‹ › بین هفته‌های شمسی جابه‌جا شوید.</li>
              <li>در جدول خلاصه، خرج و واریز هر روز را ببینید.</li>
              <li>با «جزئیات» وارد همان روز شوید و قلم یا واریز ثبت کنید.</li>
              <li>منبع پرداخت هر قلم: شخصی یا صندوق تنخواه.</li>
              <li>واریز پیش‌فرض اعتبار عضو است؛ هدیه را جدا انتخاب کنید.</li>
              {expensesHref ? (
                <li>
                  تقسیم پیچیده؟{" "}
                  <Link href={`${expensesHref}?from=ledger#quick-expense`}>
                    {NAV_LABELS.fullExpense}
                  </Link>
                </li>
              ) : null}
            </ol>
            <Button type="button" onClick={dismissTip}>
              متوجه شدم
            </Button>
          </div>
        ) : null}

        <div className={selectedDay ? `${styles.dayShell}` : "dlShell"}>
          {error && !ledger ? (
            <EmptyHint>
              {error}{" "}
              <Button type="button" variant="secondary" onClick={load} disabled={pending}>
                تلاش دوباره
              </Button>
            </EmptyHint>
          ) : null}

          {ledger && !selectedDay ? (
            <div className="dlSummary" aria-label="خلاصه بازه">
              <div>
                <span>جمع خرج</span>
                <strong>
                  <Amount irrMinor={ledger.totals.grand.amountMinor} />
                </strong>
              </div>
              <div>
                <span>جمع واریز</span>
                <strong>
                  <Amount
                    irrMinor={ledger.days
                      .reduce((acc, d) => acc + BigInt(sumDayFundDeposits(d)), 0n)
                      .toString()}
                  />
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

        {ledger?.canManageLocks && !selectedDay ? (
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

        {!ledger && !error ? (
          <ContentSkeleton rows={4} label="در حال بارگذاری دفتر…" />
        ) : null}

        {ledger && selectedDay && workspaceId ? (
          <DailyLedgerDayView
            workspaceId={workspaceId}
            ledger={ledger}
            day={selectedDay}
            members={ledger.members}
            fundNameById={fundNameById}
            catalogEnabled={chrome.capabilities?.providers?.catalog === "catalog_v1"}
            readOnly={readOnly}
            pending={pending}
            canDeposit={canDeposit}
            rangeLabel={rangeHeadline(ledger.from, ledger.to, preset)}
            preferMemberUserId={myUserId}
            lastMemberUserId={lastMemberUserId}
            prevDay={prevDayMeta}
            nextDay={nextDayMeta}
            onBack={closeDay}
            onGoDate={openDay}
            onOpenDraft={openDraft}
            onOpenDeposit={canDeposit ? () => openDeposit(selectedDay.date) : undefined}
            onDeleteItem={deleteItem}
            onEditNote={() => setDayNote({ date: selectedDay.date, note: selectedDay.note ?? "" })}
            onToggleHoliday={() => toggleHoliday(selectedDay.date, selectedDay.isHoliday)}
            onPosted={() => {
              setInfo("مصرف روزانه ثبت شد");
              setError(null);
              load();
            }}
            onError={(message) => setError(message)}
            expensesHref={expensesHref}
          />
        ) : null}

        {ledger && !selectedDay ? (
          <div className={styles.overviewStack}>
            <div className={styles.tableBand}>
            <DailyLedgerToolbar
              workspaces={workspaces}
              workspaceId={workspaceId}
              settlementsHref={settlementsHref}
              onWorkspaceChange={setWorkspaceId}
              preset={preset}
              from={from}
              to={to}
              daysCount={daysCount}
              showCustomRange={showCustomRange}
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
              onExportCsv={exportCsv}
            />

            <DailyLedgerOverviewTable
              ledger={ledger}
              todayIso={todayIso}
              pending={pending}
              onOpenDay={openDay}
              onToggleHoliday={readOnly ? undefined : toggleHoliday}
            />
            </div>

            <details className={styles.memberTotals}>
              <summary>مصرف اعضا در بازه</summary>
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
            </details>
          </div>
        ) : null}

        {!selectedDay ? (
        <DailyLedgerSidePanels
          balances={balances}
          members={ledger?.members ?? []}
          settlementsHref={settlementsHref}
          importCsv={importCsv}
          onImportCsvChange={(value) => {
            setImportCsv(value);
            setUnmappedColumns([]);
            setPendingImport(null);
            setColumnMap({});
            setImportPreview([]);
          }}
          onRunImport={runImport}
          onImportXlsxFile={runImportXlsx}
          unmappedColumns={unmappedColumns}
          columnMap={columnMap}
          onColumnMapChange={(col, value) =>
            setColumnMap((prev) => ({ ...prev, [col]: value }))
          }
          onConfirmMappedImport={confirmMappedImport}
          importPreview={importPreview}
          onImportPreviewChange={setImportPreview}
          sheetSource={sheetSource}
          onSheetSourceChange={setSheetSource}
          pending={pending}
          readOnly={readOnly}
        />
        ) : null}
        </div>

        {readOnly ? (
          <StatusLine>
            نقش {membershipRoleLabel(myRole)} فقط مشاهده دارد — ثبت/ویرایش قلم و CSV فعال نیست.
          </StatusLine>
        ) : null}

        <DailyLedgerModal
          open={Boolean(draft && !readOnly)}
          ariaLabel={draft?.expenseId ? "ویرایش کالا" : "افزودن کالا"}
          title={draft?.expenseId ? "ویرایش قلم" : "افزودن قلم"}
          onClose={() => {
            setDraft(null);
            setDraftCatalog(null);
          }}
        >
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
                onChange={(e) => {
                  setItemName(e.target.value);
                  setDraftCatalog(null);
                }}
                placeholder="مثلاً لیموناد بطری"
              />
              {workspaceId && chrome.capabilities?.providers?.catalog === "catalog_v1" ? (
                <CatalogPicker
                  workspaceId={workspaceId}
                  enabled
                  label="انتخاب از کاتالوگ"
                  onSelect={(sel) => {
                    setItemName(sel.title);
                    const qty = sel.quantity > 0 ? sel.quantity : 1;
                    setItemQuantity(String(qty));
                    setItemUnitToman(
                      irrMinorToDisplayInput(sel.unitPriceMinor, displayUnit),
                    );
                    const totalMinor = String(
                      Math.round(qty * Number(sel.unitPriceMinor)),
                    );
                    setItemToman(irrMinorToDisplayInput(totalMinor, displayUnit));
                    setDraftCatalog({
                      catalogItemId: sel.catalogItemId,
                      unitCode: sel.unitCode,
                      quantity: qty,
                      unitPriceMinor: sel.unitPriceMinor,
                    });
                  }}
                />
              ) : null}
              <TextField
                label={
                  draftCatalog
                    ? `تعداد (${draftCatalog.unitCode})`
                    : "تعداد"
                }
                inputMode="decimal"
                value={itemQuantity}
                onChange={(e) => {
                  const next = e.target.value;
                  setItemQuantity(next);
                  setDraftCatalog((prev) =>
                    prev
                      ? {
                          ...prev,
                          quantity:
                            Number(String(next).replaceAll(",", "").trim()) ||
                            prev.quantity,
                        }
                      : prev,
                  );
                  syncLineTotalFromUnit(next, itemUnitToman);
                }}
                placeholder="1"
              />
              <TextField
                label={moneyFieldLabel("مبلغ واحد", displayUnit)}
                value={itemUnitToman}
                onChange={(e) => {
                  const next = e.target.value;
                  setItemUnitToman(next);
                  const unitMoney = displayInputToIrrMinor(next, displayUnit);
                  if (unitMoney) {
                    setDraftCatalog((prev) =>
                      prev
                        ? { ...prev, unitPriceMinor: unitMoney.amountMinor }
                        : prev,
                    );
                  }
                  syncLineTotalFromUnit(itemQuantity, next);
                }}
                placeholder="60000"
              />
              {(() => {
                const qty = parseDraftQuantity();
                const unit = displayInputToIrrMinor(itemUnitToman, displayUnit);
                if (qty != null && unit) {
                  return (
                    <StatusLine>
                      جمع خط:{" "}
                      <Amount
                        irrMinor={String(
                          Math.round(qty * Number(unit.amountMinor)),
                        )}
                      />
                      {draftCatalog ? " · کاتالوگ" : null}
                    </StatusLine>
                  );
                }
                return <StatusLine>جمع = تعداد × مبلغ واحد</StatusLine>;
              })()}
              <SelectField
                label="منبع پرداخت"
                value={
                  fundingSourceKind === "petty_cash" && fundingRefId
                    ? `petty:${fundingRefId}`
                    : "personal"
                }
                onChange={(e) => {
                  const v = e.target.value;
                  if (v.startsWith("petty:")) {
                    setFundingSourceKind("petty_cash");
                    setFundingRefId(v.slice("petty:".length));
                  } else {
                    setFundingSourceKind("personal");
                    setFundingRefId("");
                  }
                }}
              >
                <option value="personal">حساب شخصی پرداخت‌کننده</option>
                {pettyFunds.map((f) => (
                  <option key={f.id} value={`petty:${f.id}`}>
                    صندوق تنخواه · {f.name}
                  </option>
                ))}
              </SelectField>
              {fundingSourceKind === "petty_cash" ? (
                <StatusLine>
                  این قلم از موجودی صندوق کم می‌شود (بدهی اعضا طبق تقسیم مصرف همان
                  قلم است).
                </StatusLine>
              ) : (
                <StatusLine>پرداخت از جیب شخص — بدون برداشت از تنخواه.</StatusLine>
              )}
              <div className="dlModalActions">
                <Button type="button" onClick={submitEntry} disabled={pending}>
                  {draft?.expenseId ? "ذخیره" : "ثبت"}
                </Button>
                <Button
                  type="button"
                  onClick={() => {
                    setDraft(null);
                    setDraftCatalog(null);
                  }}
                >
                  انصراف
                </Button>
              </div>
        </DailyLedgerModal>

        <DailyLedgerModal
          open={Boolean(depositDate && !readOnly)}
          ariaLabel="واریز به صندوق تنخواه"
          title="واریز به صندوق"
          onClose={() => setDepositDate(null)}
        >
              <StatusLine>
                تاریخ {formatJalaliIso(depositDate ?? todayIso)} ·{" "}
                {depositMode === "gift"
                  ? "هدیه: فقط موجودی صندوق بالا می‌رود (مانده اعضا عوض نمی‌شود)."
                  : "پیش‌فرض: اعتبار واریزکننده — اول بدهی کم می‌شود، مازاد بستانکار می‌شود."}
              </StatusLine>
              <SelectField
                label="نوع واریز"
                value={depositMode}
                onChange={(e) =>
                  setDepositMode(e.target.value === "gift" ? "gift" : "balance")
                }
              >
                <option value="balance">اعتبار عضو (کاهش بدهی / بستانکار)</option>
                <option value="gift">هدیه به صندوق (بدون اثر روی مانده)</option>
              </SelectField>
              <SelectField
                label="صندوق"
                value={depositFundId}
                onChange={(e) => setDepositFundId(e.target.value)}
              >
                {pettyFunds.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name} · موجودی{" "}
                    {irrMinorToDisplayInput(f.balanceMinor, displayUnit) || "0"}{" "}
                    {unitLabel}
                  </option>
                ))}
              </SelectField>
              <SelectField
                label="واریزکننده"
                value={depositCashInBy}
                onChange={(e) => setDepositCashInBy(e.target.value)}
              >
                {(ledger?.members ?? []).map((m) => (
                  <option key={m.userId} value={m.userId}>
                    {m.displayName}
                  </option>
                ))}
              </SelectField>
              <TextField
                label={moneyFieldLabel("مبلغ واریز", displayUnit)}
                value={depositToman}
                onChange={(e) => setDepositToman(e.target.value)}
                placeholder="500000"
              />
              <TextField
                label="یادداشت (اختیاری)"
                value={depositNote}
                onChange={(e) => setDepositNote(e.target.value)}
                placeholder="مثلاً سهم ماهانه صندوق"
              />
              {depositMember ? (
                <StatusLine>
                  {depositMode === "gift" ? (
                    <>
                      ماندهٔ {depositMember.displayName} تغییر نمی‌کند (
                      <Amount irrMinor={depositMemberNet} />
                      ).
                    </>
                  ) : (
                    <>
                      ماندهٔ {depositMember.displayName}:{" "}
                      <Amount irrMinor={depositMemberNet} />
                      {" → "}
                      <Amount irrMinor={depositProjectedNet} />
                      {balances ? null : " · مانده زنده هنوز بارگذاری نشده"}
                    </>
                  )}
                  {selectedFund ? (
                    <>
                      {" · "}موجودی {selectedFund.name}:{" "}
                      <Amount irrMinor={selectedFund.balanceMinor} />
                      {" → "}
                      <Amount irrMinor={fundAfterDeposit} />
                    </>
                  ) : null}
                </StatusLine>
              ) : (
                <StatusLine>واریزکننده را انتخاب کنید تا پیش‌نمایش مانده دیده شود.</StatusLine>
              )}
              {error ? (
                <StatusLine>
                  <span className="liveError">{error}</span>
                </StatusLine>
              ) : null}
              <div className="dlModalActions">
                <Button type="button" onClick={submitDeposit} disabled={pending}>
                  ثبت واریز
                </Button>
                <Button type="button" onClick={() => setDepositDate(null)}>
                  انصراف
                </Button>
              </div>
        </DailyLedgerModal>

        <DailyLedgerModal
          open={Boolean(dayNote)}
          ariaLabel="توضیح روز"
          title={dayNote ? `توضیحات ${formatJalaliIso(dayNote.date)}` : "توضیح روز"}
          onClose={() => setDayNote(null)}
        >
              <TextField
                label="یادداشت"
                value={dayNote?.note ?? ""}
                onChange={(e) =>
                  setDayNote((prev) =>
                    prev ? { ...prev, note: e.target.value } : prev,
                  )
                }
              />
              <div className="dlModalActions">
                <Button type="button" onClick={saveDayNote} disabled={pending}>
                  ذخیره
                </Button>
                <Button type="button" onClick={() => setDayNote(null)}>
                  انصراف
                </Button>
              </div>
        </DailyLedgerModal>
      </FormStack>
      </SectionCard>
    </>
    </WorkspacePageFrame>
  );
}
