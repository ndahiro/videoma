import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { usersTable } from "./users";

/**
 * usage_events — metered product usage, one row per billable action.
 *
 *   kind: ingest | search | query | summarize | process
 *   unit: minutes | queries | jobs
 *
 * Monthly totals are computed with a SUM() over created_at >= start of month,
 * and compared against the limits declared in src/lib/plans.ts.
 */
export const usageEventsTable = pgTable(
  "usage_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    unit: text("unit").notNull(),
    quantity: integer("quantity").notNull().default(1),
    videoId: text("video_id"),
    meta: jsonb("meta"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    userCreatedIdx: index("usage_events_user_created_idx").on(
      table.userId,
      table.createdAt,
    ),
    kindIdx: index("usage_events_kind_idx").on(table.kind),
  }),
);

export type UsageEvent = typeof usageEventsTable.$inferSelect;
