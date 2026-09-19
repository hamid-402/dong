import {
  date,
  index,
  integer,
  pgSchema,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { workspace } from "./iam.js";

export const analytics = pgSchema("analytics");

export const dailySpendFact = analytics.table(
  "daily_spend_fact",
  {
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    day: date("day").notNull(),
    expenseCount: integer("expense_count").notNull().default(0),
    totalMinor: text("total_minor").notNull(),
    currency: text("currency").notNull().default("IRR"),
    refreshedAt: timestamp("refreshed_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.workspaceId, table.day] }),
    index("analytics_daily_spend_workspace_day_idx").on(
      table.workspaceId,
      table.day,
    ),
  ],
);

export const etlRun = analytics.table(
  "etl_run",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    finishedAt: timestamp("finished_at", { withTimezone: true }).notNull(),
    status: text("status").notNull(),
    rowsUpserted: integer("rows_upserted").notNull().default(0),
    source: text("source").notNull(),
    error: text("error"),
  },
  (table) => [
    index("analytics_etl_run_workspace_idx").on(
      table.workspaceId,
      table.finishedAt,
    ),
  ],
);
