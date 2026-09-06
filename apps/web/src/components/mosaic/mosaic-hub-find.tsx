"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { ExpenseSummary, MembershipSummary } from "@dang/contracts";
import { spaceKindForTemplate } from "@dang/contracts";
import { api } from "@/lib/api";
import { hubPathFor } from "@/lib/hub-links";
import { workspaceTemplateLabel } from "@/lib/status-labels";
import { useAppChrome } from "@/lib/use-app-chrome";

const KIND_HOME = {
  personal: "/me",
  group: "/group",
  org: "/orgs",
} as const;

type FindHit =
  | { kind: "workspace"; id: string; title: string; meta: string; href: string; onPick?: () => void }
  | { kind: "member"; id: string; title: string; meta: string; href: string }
  | { kind: "expense"; id: string; title: string; meta: string; href: string };

/** Find within API-backed data — workspaces + members/expenses of active space. */
export function MosaicHubFind() {
  const chrome = useAppChrome();
  const [q, setQ] = useState("");
  const [members, setMembers] = useState<MembershipSummary[]>([]);
  const [expenses, setExpenses] = useState<ExpenseSummary[]>([]);

  useEffect(() => {
    if (!chrome.workspaceId || !chrome.ready) {
      setMembers([]);
      setExpenses([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const [m, e] = await Promise.all([
          api.listMembers(chrome.workspaceId),
          api.listExpenses(chrome.workspaceId),
        ]);
        if (!cancelled) {
          setMembers(m);
          setExpenses(e);
        }
      } catch {
        if (!cancelled) {
          setMembers([]);
          setExpenses([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [chrome.ready, chrome.workspaceId]);

  const hits = useMemo((): FindHit[] => {
    const needle = q.trim().toLowerCase();
    if (!needle || !chrome.ready) return [];

    const out: FindHit[] = [];

    for (const w of chrome.workspaces) {
      const label = workspaceTemplateLabel(w.template);
      if (
        w.name.toLowerCase().includes(needle) ||
        label.toLowerCase().includes(needle)
      ) {
        const kind = spaceKindForTemplate(w.template);
        out.push({
          kind: "workspace",
          id: w.id,
          title: w.name,
          meta: `فضا · ${label}`,
          href: hubPathFor(KIND_HOME[kind]),
          onPick: () => chrome.selectWorkspace(w.id),
        });
      }
    }

    for (const m of members) {
      if (m.displayName.toLowerCase().includes(needle)) {
        out.push({
          kind: "member",
          id: `${m.workspaceId}:${m.userId}`,
          title: m.displayName,
          meta: `عضو · ${m.role}`,
          href: hubPathFor("/group"),
        });
      }
    }

    for (const e of expenses.slice(0, 80)) {
      if (e.title.toLowerCase().includes(needle)) {
        out.push({
          kind: "expense",
          id: e.id,
          title: e.title,
          meta: `خرج · ${e.status}`,
          href: hubPathFor("/workspaces"),
        });
      }
    }

    return out.slice(0, 12);
  }, [chrome.ready, chrome.selectWorkspace, chrome.workspaces, expenses, members, q]);

  const kindsPresent = new Set(hits.map((h) => h.kind));

  return (
    <div className="mosaic-find">
      <label className="mosaic-find__label" htmlFor="mosaic-hub-find">
        یافتن
      </label>
      <input
        id="mosaic-hub-find"
        className="mosaic-find__input"
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="فضا، عضو، یا عنوان خرج…"
        autoComplete="off"
      />
      {q.trim() && hits.length === 0 ? (
        <p className="mosaic-find__empty">نتیجه‌ای از داده‌های واقعی پیدا نشد.</p>
      ) : null}
      {hits.length > 0 ? (
        <ul className="mosaic-find__list">
          {hits.map((hit) => (
            <li key={`${hit.kind}:${hit.id}`}>
              <Link
                href={hit.href}
                onClick={() => {
                  if (hit.kind === "workspace" && hit.onPick) hit.onPick();
                }}
              >
                <b>{hit.title}</b>
                <small>{hit.meta}</small>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
      {q.trim() && kindsPresent.size > 0 ? (
        <p className="mosaic-find__hint" aria-live="polite">
          {[
            kindsPresent.has("workspace") ? "فضا" : null,
            kindsPresent.has("member") ? "عضو" : null,
            kindsPresent.has("expense") ? "خرج" : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
      ) : null}
    </div>
  );
}
