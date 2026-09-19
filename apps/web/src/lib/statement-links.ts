/** Shareable member-statement deep links (real range query only — no invented amounts). */

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Calendar month bounds in UTC days (same convention as statements view). */
export function statementMonthBounds(d = new Date()): { from: string; to: string } {
  const y = d.getFullYear();
  const m = d.getMonth();
  const from = new Date(Date.UTC(y, m, 1));
  const to = new Date(Date.UTC(y, m + 1, 0));
  return { from: isoDay(from), to: isoDay(to) };
}

export function statementRangeQuery(opts: {
  from: string;
  to: string;
  granularity?: "day" | "period";
  catalogItemId?: string;
}): string {
  const params = new URLSearchParams();
  params.set("from", opts.from);
  params.set("to", opts.to);
  if (opts.granularity === "day") params.set("granularity", "day");
  if (opts.catalogItemId?.trim()) params.set("catalogItemId", opts.catalogItemId.trim());
  return params.toString();
}

export type StatementRangeOpts = {
  from?: string;
  to?: string;
  granularity?: "day" | "period";
  catalogItemId?: string;
};

/** Parse live URL search into statement range opts (empty → undefined fields). */
export function statementRangeFromSearch(
  search: string | URLSearchParams | null | undefined,
): StatementRangeOpts {
  const params =
    typeof search === "string"
      ? new URLSearchParams(search.startsWith("?") ? search.slice(1) : search)
      : search instanceof URLSearchParams
        ? search
        : new URLSearchParams();
  const from = params.get("from")?.trim() || undefined;
  const to = params.get("to")?.trim() || undefined;
  const gran = params.get("granularity");
  const granularity =
    gran === "day" ? "day" : gran === "period" ? "period" : undefined;
  const catalogItemId = params.get("catalogItemId")?.trim() || undefined;
  return { from, to, granularity, catalogItemId };
}

/** List URL for workspace statements with optional range (defaults to this month). */
export function statementsListHref(
  slug: string,
  range?: StatementRangeOpts,
): string {
  const bounds = statementMonthBounds();
  const from = range?.from || bounds.from;
  const to = range?.to || bounds.to;
  const qs = statementRangeQuery({
    from,
    to,
    granularity: range?.granularity,
    catalogItemId: range?.catalogItemId,
  });
  return `/w/${encodeURIComponent(slug)}/statements?${qs}`;
}

/** Member statement deep link with date range (defaults to this month). */
export function memberStatementHref(
  slug: string,
  userId: string,
  range?: StatementRangeOpts,
): string {
  const bounds = statementMonthBounds();
  const from = range?.from || bounds.from;
  const to = range?.to || bounds.to;
  const qs = statementRangeQuery({
    from,
    to,
    granularity: range?.granularity,
    catalogItemId: range?.catalogItemId,
  });
  return `/w/${encodeURIComponent(slug)}/statements/${encodeURIComponent(userId)}?${qs}`;
}
