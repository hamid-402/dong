"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  isFinanceManagerRole,
  isReadOnlyRole,
  type MembershipRole,
  type WorkspaceSubunitSummary,
} from "@dang/contracts";
import { api } from "@/lib/api";
import { expenseHrefForUnit } from "@/lib/expense-unit-href";
import { NAV_LABELS } from "@/lib/nav-labels";
import {
  isSubunitPinned,
  listPinnedSubunits,
  listRecentSubunits,
  rememberSubunitVisit,
  togglePinnedSubunit,
} from "@/lib/subunit-directory-prefs";
import { wPath } from "@/lib/workspace-paths";
import styles from "@/components/shell/structural-subunits-rail.module.css";

/**
 * Compact structural rail for org/building space home —
 * pinned + recent subunits from live API + local prefs (no fake rows).
 */
export function StructuralSubunitsRail({
  workspaceId,
  slug,
  spaceKind,
  myRole,
}: {
  workspaceId: string;
  slug: string;
  spaceKind: "building" | "org";
  myRole?: MembershipRole | null;
}) {
  const [rows, setRows] = useState<WorkspaceSubunitSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [tick, setTick] = useState(0);
  const [showAll, setShowAll] = useState(false);

  const noun = spaceKind === "building" ? "واحد" : "بخش";
  const canCharge =
    !isReadOnlyRole(myRole) &&
    (isFinanceManagerRole(myRole) ||
      myRole === "owner" ||
      myRole === "admin" ||
      myRole === "buyer");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void api
      .listSubunits(workspaceId)
      .then((list) => {
        if (cancelled) return;
        setRows(list);
        setError(null);
      })
      .catch(() => {
        if (cancelled) return;
        setRows([]);
        setError("بارگذاری واحدها ناموفق بود.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [workspaceId]);

  const byId = useMemo(() => {
    const map = new Map(rows.map((row) => [row.id, row]));
    return map;
  }, [rows]);

  const railRows = useMemo(() => {
    void tick;
    const pinIds = listPinnedSubunits(workspaceId).map((p) => p.subunitId);
    const recentIds = listRecentSubunits(workspaceId)
      .map((r) => r.subunitId)
      .filter((id) => !pinIds.includes(id));
    const orderedIds = [...pinIds, ...recentIds];
    const ordered = orderedIds
      .map((id) => byId.get(id))
      .filter((row): row is WorkspaceSubunitSummary => Boolean(row));
    if (ordered.length > 0) return ordered.slice(0, 5);
    return rows.slice(0, 5);
  }, [workspaceId, byId, rows, tick]);

  const filteredAll = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) => {
      const hay = `${row.name} ${row.code}`.toLowerCase();
      return hay.includes(q);
    });
  }, [rows, query]);

  const visibleAll = showAll ? filteredAll : filteredAll.slice(0, 12);
  const hiddenCount = Math.max(0, filteredAll.length - visibleAll.length);

  if (loading) {
    return (
      <section className={styles.rail} aria-busy="true" aria-label={noun}>
        <header className={styles.head}>
          <h2>{noun}ها</h2>
          <span className={styles.meta}>در حال بارگذاری…</span>
        </header>
      </section>
    );
  }

  if (error) {
    return (
      <section className={styles.rail} aria-label={noun}>
        <header className={styles.head}>
          <h2>{noun}ها</h2>
        </header>
        <p className={styles.error}>{error}</p>
        <Link href={wPath(slug, "subunits")}>{NAV_LABELS.subunits}</Link>
      </section>
    );
  }

  if (rows.length === 0) {
    return (
      <section className={styles.rail} aria-label={noun}>
        <header className={styles.head}>
          <h2>{noun}ها</h2>
          <span className={styles.meta}>هنوز ثبت نشده</span>
        </header>
        <p className={styles.empty}>
          {spaceKind === "building"
            ? "واحدهای ساختمان را اضافه کنید تا شارژ و خرج به آن‌ها وصل شود."
            : "بخش‌ها یا شرکت‌های زیرمجموعه را اضافه کنید."}
        </p>
        <Link className={styles.cta} href={wPath(slug, "subunits")}>
          مدیریت {noun}ها
        </Link>
      </section>
    );
  }

  function openUnit(row: WorkspaceSubunitSummary) {
    rememberSubunitVisit(workspaceId, row.id);
    setTick((n) => n + 1);
  }

  return (
    <section className={styles.rail} aria-label={`${noun}های ساختاری`}>
      <header className={styles.head}>
        <h2>
          {noun}ها
          <span className={styles.count}>
            {rows.length.toLocaleString("fa-IR")}
          </span>
        </h2>
        <Link href={wPath(slug, "subunits")}>همه</Link>
      </header>

      {railRows.length > 0 ? (
        <ul className={styles.quick}>
          {railRows.map((row) => {
            const pinned = isSubunitPinned(workspaceId, row.id);
            const expensesHref = wPath(slug, "expenses");
            return (
              <li key={row.id} className={styles.quickRow}>
                <Link
                  href={wPath(slug, "subunits")}
                  className={styles.quickMain}
                  onClick={() => openUnit(row)}
                >
                  <b>{row.name}</b>
                  <small dir="ltr">{row.code}</small>
                </Link>
                <button
                  type="button"
                  className={`${styles.pin}${pinned ? ` ${styles.pinOn}` : ""}`}
                  aria-pressed={pinned}
                  aria-label={pinned ? `برداشتن پین ${row.name}` : `پین ${row.name}`}
                  onClick={() => {
                    togglePinnedSubunit(workspaceId, row.id);
                    setTick((n) => n + 1);
                  }}
                >
                  {pinned ? "★" : "☆"}
                </button>
                {canCharge ? (
                  <Link
                    className={styles.charge}
                    href={expenseHrefForUnit(expensesHref, row.code, row.name)}
                    onClick={() => openUnit(row)}
                  >
                    ثبت
                  </Link>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}

      <label className={styles.search}>
        <span className="visually-hidden">جستجوی {noun}</span>
        <input
          type="search"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setShowAll(false);
          }}
          placeholder={`جستجوی ${noun}…`}
          autoComplete="off"
        />
      </label>

      <ul className={styles.list}>
        {visibleAll.map((row) => (
          <li key={`all-${row.id}`}>
            <Link
              href={wPath(slug, "subunits")}
              onClick={() => openUnit(row)}
            >
              <b>{row.name}</b>
              <small dir="ltr">{row.code}</small>
            </Link>
          </li>
        ))}
      </ul>

      {hiddenCount > 0 ? (
        <button
          type="button"
          className={styles.more}
          onClick={() => setShowAll(true)}
        >
          نمایش {hiddenCount.toLocaleString("fa-IR")} {noun} دیگر
        </button>
      ) : null}
    </section>
  );
}
