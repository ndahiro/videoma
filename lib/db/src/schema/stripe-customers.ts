import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

/**
 * stripe_customers — one Stripe customer per user (PK enforced), mirroring
 * CMSaasStarter's `stripe_customers` table. Rows are created lazily the first
 * time a user opens the billing page or starts a checkout.
 */
export const stripeCustomersTable = pgTable("stripe_customers", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  stripeCustomerId: text("stripe_customer_id").unique(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type StripeCustomer = typeof stripeCustomersTable.$inferSelect;
