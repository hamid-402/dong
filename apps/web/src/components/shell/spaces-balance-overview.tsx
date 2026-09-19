"use client";

import type { SpaceKind } from "@dang/contracts";
import Link from "next/link";
import { formatToman } from "@dang/ui";
import {
  groupSpaceNetsByKind,
  type SpaceNetAggregate,
  type SpaceNetRow,
} from "@/lib/space-net-balance";
import { spaceTabLabel } from "@/lib/nav-labels";
import { wPath } from "@/lib/workspace-paths";

const KIND_HINT: Record<SpaceKind, string> = {
  personal: "فقط دفتر شخصی — با گروه و ساختمان جمع نمی‌شود.",
  group: "فقط گروه‌ها — طلب/بدهی سفر و دوستان جدا از سازمان است.",
  building: "فقط ساختمان‌ها — شارژ و قبوض واحدها جدا از گروه است.",
  org: "فقط سازمان‌ها — تدارکات و خرج شرکتی جدا از گروه دوستانه است.",
};

function KindBalanceCard({
  kind,
  aggregate,
  spaceCount,
}: {
  kind: SpaceKind;
  aggregate: SpaceNetAggregate;
  spaceCount: number;
}) {
  const settled = aggregate.unsettledCount === 0;
  const titleId = `spaces-balance-${kind}`;
  const label = spaceTabLabel(kind);

  return (
    <section
      className="spacesBalanceOverview"
      aria-labelledby={titleId}
      data-space-kind={kind}
    >
      <div className="spacesBalanceOverview__head">
        <h2 id={titleId}>جمع‌ماندهٔ {label}</h2>
        <p>
          {settled
            ? `در ${spaceCount.toLocaleString("fa-IR")} فضای ${label} حساب‌ها تسویه است.`
            : KIND_HINT[kind]}
        </p>
      </div>
      <dl className="spacesBalanceOverview__grid">
        <div className="is-credit">
          <dt>طلب دارید</dt>
          <dd>{formatToman(aggregate.youAreOwedToman)} تومان</dd>
        </div>
        <div className="is-debt">
          <dt>بدهکارید</dt>
          <dd>{formatToman(aggregate.youOweToman)} تومان</dd>
        </div>
        <div>
          <dt>تسویه باز</dt>
          <dd>{aggregate.openSettlements.toLocaleString("fa-IR")} مورد</dd>
        </div>
      </dl>
      <div className="spacesBalanceOverview__actions">
        {aggregate.topDebt ? (
          <Link
            className="shell-v2__cta"
            href={wPath(aggregate.topDebt.slug, "settlements")}
          >
            تسویهٔ «{aggregate.topDebt.name}»
          </Link>
        ) : aggregate.topCredit ? (
          <Link
            className="shell-v2__cta"
            href={wPath(aggregate.topCredit.slug, "settlements")}
          >
            پیگیری طلب «{aggregate.topCredit.name}»
          </Link>
        ) : null}
        {aggregate.openSettlements > 0 && !aggregate.topDebt ? (
          <span className="liveHint">
            {aggregate.openSettlements.toLocaleString("fa-IR")} تسویه در جریان در{" "}
            {label}
          </span>
        ) : null}
        <Link className="textButton" href={`/spaces?kind=${kind}`}>
          فضاهای {label}
        </Link>
      </div>
    </section>
  );
}

/**
 * Hub balance strips — one card per space kind.
 * Never mixes personal / group / building / org ledgers into a single total.
 */
export function SpacesBalanceOverview({
  rows,
  loading,
  onlyKind = null,
}: {
  rows: SpaceNetRow[];
  loading: boolean;
  /** When set (e.g. /spaces?kind=building), show only that ledger. */
  onlyKind?: SpaceKind | null;
}) {
  if (loading && rows.length === 0) {
    return (
      <section className="spacesBalanceOverview is-loading" aria-busy="true">
        <p className="liveHint">در حال جمع‌مانده از داشبورد فضاها…</p>
      </section>
    );
  }

  const groups = groupSpaceNetsByKind(rows, onlyKind);
  if (groups.length === 0) return null;

  return (
    <div className="spacesBalanceOverviewStack" role="group" aria-label="جمع‌مانده به‌تفکیک نوع فضا">
      {groups.map(({ kind, rows: kindRows, aggregate }) => (
        <KindBalanceCard
          key={kind}
          kind={kind}
          aggregate={aggregate}
          spaceCount={kindRows.length}
        />
      ))}
    </div>
  );
}
