"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import type {
  CatalogFrequentItem,
  DailyLedgerDayTemplateResponse,
  DailyLedgerResponse,
  LedgerDayLineInput,
} from "@dang/contracts";
import { Amount, Button, TextField } from "@dang/ui";
import { CatalogPicker } from "@/components/catalog-picker";
import { EmptyHint, FormStack, StatusLine } from "@/components/ui-blocks";
import { api } from "@/lib/api";
import { friendlyErrorMessage } from "@/lib/api-errors";
import { newClientId } from "@/lib/id";
import styles from "./daily-tick-panel.module.css";

type TickShared = {
  key: string;
  catalogItemId: string;
  itemName: string;
  unitCode: string;
  unitPriceMinor: string;
  quantity: number;
  checked: boolean;
};

type TickPersonalCol = {
  catalogItemId: string;
  itemName: string;
  unitCode: string;
  unitPriceMinor: string;
};

type DailyTickPanelProps = {
  workspaceId: string;
  date: string;
  members: DailyLedgerResponse["members"];
  catalogEnabled: boolean;
  readOnly?: boolean;
  pending: boolean;
  onPosted: () => void;
  onError: (message: string) => void;
};

/**
 * Tick-mode daily consumption: shared equal-split rows + personal matrix (S11-07).
 * Free-text “افزودن قلم” remains elsewhere — this panel is additive.
 */
export function DailyTickPanel({
  workspaceId,
  date,
  members,
  catalogEnabled,
  readOnly = false,
  pending,
  onPosted,
  onError,
}: DailyTickPanelProps) {
  const [template, setTemplate] = useState<DailyLedgerDayTemplateResponse | null>(null);
  const [shared, setShared] = useState<TickShared[]>([]);
  const [personalCols, setPersonalCols] = useState<TickPersonalCol[]>([]);
  /** memberUserId → set of catalogItemId */
  const [ticks, setTicks] = useState<Record<string, Record<string, boolean>>>({});
  const [freeName, setFreeName] = useState("");
  const [freeToman, setFreeToman] = useState("");
  const [freeMember, setFreeMember] = useState<string>("shared");
  const [loading, startLoad] = useTransition();
  const [submitting, startSubmit] = useTransition();

  useEffect(() => {
    if (!workspaceId || !catalogEnabled || !date) {
      setTemplate(null);
      return;
    }
    startLoad(() => {
      void (async () => {
        try {
          const data = await api.getLedgerDayTemplate(workspaceId, date);
          setTemplate(data);
          const fromFrequent = data.frequentItems.slice(0, 8);
          const fromPins = (data.pins ?? [])
            .map((p) => p.item)
            .filter((item): item is NonNullable<typeof item> => Boolean(item && item.active));
          const seedItems = uniqueById([
            ...fromPins.map((i) => ({ ...i, useCount: 0, lastUsedAt: "" })),
            ...fromFrequent,
          ]);
          setShared(
            seedItems.slice(0, 4).map((item) => ({
              key: item.id,
              catalogItemId: item.id,
              itemName: item.name,
              unitCode: item.unitCode,
              unitPriceMinor: item.referencePriceMinor,
              quantity: 1,
              checked: false,
            })),
          );
          setPersonalCols(
            seedItems.slice(0, 6).map((item) => ({
              catalogItemId: item.id,
              itemName: item.name,
              unitCode: item.unitCode,
              unitPriceMinor: item.referencePriceMinor,
            })),
          );
          setTicks({});
        } catch (err: unknown) {
          onError(friendlyErrorMessage(err, "بارگذاری قالب روز ناموفق"));
          setTemplate({ date, frequentItems: [], pins: [], yesterdayLines: [] });
          setShared([]);
          setPersonalCols([]);
        }
      })();
    });
  }, [workspaceId, catalogEnabled, date]);

  const dayTotalMinor = useMemo(() => {
    let total = 0n;
    for (const row of shared) {
      if (!row.checked) continue;
      total += BigInt(Math.round(row.quantity * Number(row.unitPriceMinor)));
    }
    for (const member of members) {
      const row = ticks[member.userId] ?? {};
      for (const col of personalCols) {
        if (!row[col.catalogItemId]) continue;
        total += BigInt(col.unitPriceMinor);
      }
    }
    const toman = Number(freeToman.replaceAll(",", ""));
    if (freeName.trim() && Number.isFinite(toman) && toman > 0) {
      total += BigInt(Math.round(toman) * 10);
    }
    return total.toString();
  }, [shared, ticks, personalCols, members, freeName, freeToman]);

  function submitDay() {
    if (readOnly || !workspaceId) return;
    const lines: LedgerDayLineInput[] = [];

    for (const row of shared) {
      if (!row.checked) continue;
      const amountMinor = String(Math.round(row.quantity * Number(row.unitPriceMinor)));
      lines.push({
        itemName: row.itemName,
        amount: { amountMinor, currency: "IRR" },
        memberUserId: null,
        catalogItemId: row.catalogItemId,
        unitCode: row.unitCode,
        quantity: row.quantity,
        unitPriceMinor: row.unitPriceMinor,
      });
    }

    for (const member of members) {
      const row = ticks[member.userId] ?? {};
      for (const col of personalCols) {
        if (!row[col.catalogItemId]) continue;
        lines.push({
          itemName: col.itemName,
          amount: { amountMinor: col.unitPriceMinor, currency: "IRR" },
          memberUserId: member.userId,
          catalogItemId: col.catalogItemId,
          unitCode: col.unitCode,
          quantity: 1,
          unitPriceMinor: col.unitPriceMinor,
        });
      }
    }

    if (freeName.trim() && freeToman.trim()) {
      const toman = Number(freeToman.replaceAll(",", ""));
      if (Number.isFinite(toman) && toman > 0) {
        lines.push({
          itemName: freeName.trim(),
          amount: { amountMinor: String(Math.round(toman) * 10), currency: "IRR" },
          memberUserId: freeMember === "shared" ? null : freeMember,
        });
      }
    }

    if (lines.length === 0) {
      onError("حداقل یک قلم تیک‌خورده یا تایپ‌آزاد لازم است");
      return;
    }

    startSubmit(() => {
      void (async () => {
        try {
          await api.postLedgerDay(workspaceId, {
            date,
            idempotencyKey: newClientId(),
            lines,
          });
          setFreeName("");
          setFreeToman("");
          onPosted();
        } catch (err: unknown) {
          onError(friendlyErrorMessage(err, "ثبت روز ناموفق"));
        }
      })();
    });
  }

  if (!catalogEnabled) return null;

  return (
    <section className={styles.root} aria-label="ثبت سریع مصرف روزانه">
      <header className={styles.header}>
        <h3 className={styles.title}>تیک روزانه</h3>
        <StatusLine>
          {loading
            ? "بارگذاری قالب…"
            : template && template.frequentItems.length === 0 && personalCols.length === 0
              ? "پرکاربردی ثبت نشده — از کاتالوگ یا تایپ آزاد استفاده کنید"
              : "جمعی + فردی در یک ثبت"}
        </StatusLine>
      </header>

      <div className={styles.shared}>
        <h4 className={styles.sectionTitle}>جمعی (تقسیم مساوی)</h4>
        {shared.length === 0 ? <EmptyHint>قلمی برای تیک جمعی نیست.</EmptyHint> : null}
        <ul className={styles.sharedList}>
          {shared.map((row, index) => (
            <li key={row.key} className={styles.sharedRow}>
              <label className={styles.check}>
                <input
                  type="checkbox"
                  checked={row.checked}
                  disabled={readOnly || pending || submitting}
                  onChange={() => {
                    const next = shared.slice();
                    next[index] = { ...row, checked: !row.checked };
                    setShared(next);
                  }}
                />
                <span>{row.itemName}</span>
              </label>
              <button
                type="button"
                className={styles.qty}
                disabled={readOnly || !row.checked}
                onClick={() => {
                  const next = shared.slice();
                  next[index] = { ...row, quantity: row.quantity + 1 };
                  setShared(next);
                }}
              >
                {row.quantity} {row.unitCode}
              </button>
              <Amount
                irrMinor={String(Math.round(row.quantity * Number(row.unitPriceMinor)))}
              />
            </li>
          ))}
        </ul>
        {!readOnly ? (
          <CatalogPicker
            workspaceId={workspaceId}
            enabled={catalogEnabled}
            label="افزودن قلم جمعی از کاتالوگ"
            onSelect={(sel) => {
              if (shared.some((s) => s.catalogItemId === sel.catalogItemId)) return;
              setShared([
                ...shared,
                {
                  key: sel.catalogItemId,
                  catalogItemId: sel.catalogItemId,
                  itemName: sel.title,
                  unitCode: sel.unitCode,
                  unitPriceMinor: sel.unitPriceMinor,
                  quantity: 1,
                  checked: true,
                },
              ]);
            }}
          />
        ) : null}
      </div>

      <div className={styles.personal}>
        <h4 className={styles.sectionTitle}>فردی (هر کس مال خودش)</h4>
        {personalCols.length === 0 || members.length === 0 ? (
          <EmptyHint>برای ماتریس فردی، قلم پرکاربرد یا عضو لازم است.</EmptyHint>
        ) : (
          <div className={styles.matrixWrap}>
            <table className={styles.matrix}>
              <thead>
                <tr>
                  <th scope="col">عضو</th>
                  {personalCols.map((col) => (
                    <th key={col.catalogItemId} scope="col">
                      {col.itemName}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {members.map((member) => (
                  <tr key={member.userId}>
                    <th scope="row">{member.displayName}</th>
                    {personalCols.map((col) => {
                      const on = Boolean(ticks[member.userId]?.[col.catalogItemId]);
                      return (
                        <td key={col.catalogItemId}>
                          <input
                            type="checkbox"
                            aria-label={`${member.displayName} · ${col.itemName}`}
                            checked={on}
                            disabled={readOnly || pending || submitting}
                            onChange={() => {
                              setTicks((prev) => ({
                                ...prev,
                                [member.userId]: {
                                  ...(prev[member.userId] ?? {}),
                                  [col.catalogItemId]: !on,
                                },
                              }));
                            }}
                          />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {!readOnly ? (
          <CatalogPicker
            workspaceId={workspaceId}
            enabled={catalogEnabled}
            label="افزودن ستون فردی از کاتالوگ"
            onSelect={(sel) => {
              if (personalCols.some((c) => c.catalogItemId === sel.catalogItemId)) return;
              setPersonalCols([
                ...personalCols,
                {
                  catalogItemId: sel.catalogItemId,
                  itemName: sel.title,
                  unitCode: sel.unitCode,
                  unitPriceMinor: sel.unitPriceMinor,
                },
              ]);
            }}
          />
        ) : null}
      </div>

      {!readOnly ? (
        <details className={styles.freeText}>
          <summary>افزودن قلم دیگر (تایپ آزاد)</summary>
          <FormStack density="compact">
            <TextField
              label="نام"
              value={freeName}
              onChange={(e) => setFreeName(e.target.value)}
            />
            <TextField
              label="مبلغ (تومان)"
              value={freeToman}
              onChange={(e) => setFreeToman(e.target.value)}
            />
            <label className={styles.freeMember}>
              ستون
              <select value={freeMember} onChange={(e) => setFreeMember(e.target.value)}>
                <option value="shared">هزینه مشترک</option>
                {members.map((m) => (
                  <option key={m.userId} value={m.userId}>
                    {m.displayName}
                  </option>
                ))}
              </select>
            </label>
          </FormStack>
        </details>
      ) : null}

      <footer className={styles.footer}>
        <span>
          جمع امروز: <Amount irrMinor={dayTotalMinor === "0" ? "0" : dayTotalMinor} />
        </span>
        <Button
          type="button"
          disabled={readOnly || pending || submitting || dayTotalMinor === "0"}
          onClick={submitDay}
        >
          ثبت روز
        </Button>
      </footer>
    </section>
  );
}

function uniqueById(items: CatalogFrequentItem[]): CatalogFrequentItem[] {
  const seen = new Set<string>();
  const out: CatalogFrequentItem[] = [];
  for (const item of items) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    out.push(item);
  }
  return out;
}
