"use client";

import { useEffect, useState, useTransition } from "react";
import type { CatalogItem } from "@dang/contracts";
import { Amount, Button, TextField } from "@dang/ui";
import { api } from "@/lib/api";
import { friendlyErrorMessage } from "@/lib/api-errors";
import styles from "./catalog-picker.module.css";

export type CatalogPickerSelection = {
  catalogItemId: string;
  title: string;
  unitCode: string;
  unitPriceMinor: string;
  quantity: number;
  amountMinor: string;
};

type CatalogPickerProps = {
  workspaceId: string;
  /** When catalog_v1 is off, render nothing (additive free-text remains elsewhere). */
  enabled?: boolean;
  onSelect: (selection: CatalogPickerSelection) => void;
  label?: string;
};

/**
 * Shared catalog search/select for expense lines and daily ledger (S11-07).
 * Loads real items from API — empty state when none exist (never fake).
 */
export function CatalogPicker({
  workspaceId,
  enabled = true,
  onSelect,
  label = "انتخاب از کاتالوگ",
}: CatalogPickerProps) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!open || !enabled || !workspaceId) return;
    startTransition(() => {
      void (async () => {
        try {
          const page = await api.listCatalogItems(workspaceId, {
            q: q.trim() || undefined,
            activeOnly: true,
            limit: 20,
          });
          setItems(page.items);
          setError(null);
        } catch (err: unknown) {
          setError(friendlyErrorMessage(err, "بارگذاری کاتالوگ ناموفق"));
          setItems([]);
        }
      })();
    });
  }, [open, enabled, workspaceId, q]);

  if (!enabled || !workspaceId) return null;

  return (
    <div className={styles.root}>
      <Button type="button" variant="secondary" onClick={() => setOpen((v) => !v)}>
        {open ? "بستن کاتالوگ" : label}
      </Button>
      {open ? (
        <div className={styles.panel} role="listbox" aria-label={label}>
          <TextField
            label="جست‌وجو در کاتالوگ"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="نام کالا یا خدمت"
          />
          {pending ? <p className={styles.meta}>در حال بارگذاری…</p> : null}
          {error ? <p className={styles.error}>{error}</p> : null}
          {!pending && !error && items.length === 0 ? (
            <p className={styles.meta}>قلمی در کاتالوگ نیست — مسیر تایپ آزاد باقی است.</p>
          ) : null}
          <ul className={styles.list}>
            {items.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  className={styles.item}
                  onClick={() => {
                    onSelect({
                      catalogItemId: item.id,
                      title: item.name,
                      unitCode: item.unitCode,
                      unitPriceMinor: item.referencePriceMinor,
                      quantity: 1,
                      amountMinor: item.referencePriceMinor,
                    });
                    setOpen(false);
                  }}
                >
                  <span className={styles.name}>{item.name}</span>
                  <span className={styles.meta}>
                    {item.unitCode} · <Amount irrMinor={item.referencePriceMinor} />
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
