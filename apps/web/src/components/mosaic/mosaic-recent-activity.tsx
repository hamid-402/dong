"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { formatToman } from "@dang/ui";
import { api } from "@/lib/api";
import { hubPathFor } from "@/lib/hub-links";
import { useAppChrome } from "@/lib/use-app-chrome";

type ActivityItem = {
  id: string;
  title: string;
  meta: string;
  href: string;
  kind: "expense" | "need";
};

export function MosaicRecentActivity({ limit = 5 }: { limit?: number }) {
  const { workspaceId, ready } = useAppChrome();
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const capped = Math.max(1, limit);

  useEffect(() => {
    if (!ready || !workspaceId) {
      setItems([]);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        const [expenses, needs] = await Promise.all([
          api.listExpenses(workspaceId).catch(() => []),
          api.listNeeds(workspaceId).catch(() => []),
        ]);
        if (cancelled) return;

        const expenseItems: ActivityItem[] = expenses.slice(0, capped).map((e) => ({
          id: `exp-${e.id}`,
          title: e.title,
          meta: `${e.status} · ${formatToman(Math.round(Number(e.total.amountMinor) / 10))}`,
          href: hubPathFor("/workspaces"),
          kind: "expense" as const,
        }));

        const needItems: ActivityItem[] = needs.slice(0, capped).map((n) => ({
          id: `need-${n.id}`,
          title: n.title,
          meta: `نیاز · ${n.status}`,
          href: hubPathFor("/workspaces/procurement"),
          kind: "need" as const,
        }));

        const merged = [...expenseItems, ...needItems].slice(0, capped);
        setItems(merged);
      } catch {
        if (!cancelled) setItems([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [ready, workspaceId, capped]);

  return (
    <section className="mosaic-activity" aria-label="فعالیت اخیر">
      <div className="mosaic-section-label">
        <b>فعالیت اخیر</b>
        <Link href={hubPathFor("/overview")} className="mosaic-activity__all">
          همه
        </Link>
      </div>

      {loading ? (
        <p className="mosaic-activity__empty">در حال بارگذاری…</p>
      ) : items.length === 0 ? (
        <p className="mosaic-activity__empty">هنوز رویدادی ثبت نشده است.</p>
      ) : (
        <ul className="mosaic-activity__list">
          {items.map((item) => (
            <li key={item.id}>
              <Link href={item.href} className="mosaic-activity__row">
                <span className={`mosaic-activity__dot mosaic-activity__dot--${item.kind}`} aria-hidden />
                <span className="mosaic-activity__copy">
                  <b>{item.title}</b>
                  <small>{item.meta}</small>
                </span>
                <span className="mosaic-activity__chev" aria-hidden>
                  ‹
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
