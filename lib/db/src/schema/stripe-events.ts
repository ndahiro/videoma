import { jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

/**
 * stripe_events — webhook idempotency log. Stripe retries deliveries, so every
 * processed event id is recorded and replays are ignored.
 */
export const stripeEventsTable = pgTable("stripe_events", {
  id: text("id").primaryKey(),
  type: text("type").notNull(),
  payload: jsonb("payload"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export type StripeEvent = typeof stripeEventsTable.$inferSelect;
