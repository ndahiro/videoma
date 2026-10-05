import {
  boolean,
  index,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { usersTable } from "./users";

/**
 * subscriptions — a local mirror of the Stripe subscription, written by the
 * webhook handler (/api/billing/webhook). Having it locally means plan gating,
 * the account page and the admin console work with a single Postgres query and
 * keep working when Stripe is unreachable (or not configured at all).
 */
export const subscriptionsTable = pgTable(
  "subscriptions",
  {
    // Stripe subscription id (sub_...)
    id: text("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    status: text("status").notNull(),
    planId: text("plan_id").notNull().default("free"),
    priceId: text("price_id"),
    productId: text("product_id"),
    customerId: text("customer_id"),
    currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
    cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull().default(false),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    userIdIdx: index("subscriptions_user_id_idx").on(table.userId),
    statusIdx: index("subscriptions_status_idx").on(table.status),
  }),
);

export type Subscription = typeof subscriptionsTable.$inferSelect;
