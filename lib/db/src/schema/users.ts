import { boolean, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

/**
 * users — the account record. Doubles as the "profiles" table from the
 * CMSaasStarter layout (full_name / company_name / website / unsubscribed),
 * plus the SaaS state needed for gating: plan_id + subscription_status.
 *
 * `plan_id` and `subscription_status` are kept in sync by the Stripe webhook
 * handler (src/app/api/billing/webhook/route.ts) so page rendering never has
 * to call Stripe. When billing is disabled (no STRIPE_SECRET_KEY) these
 * columns are the source of truth.
 */
export const usersTable = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  username: text("username").notNull().unique(),
  email: text("email").unique(),
  passwordHash: text("password_hash").notNull(),
  fullName: text("full_name"),
  companyName: text("company_name"),
  website: text("website"),
  role: text("role").notNull().default("user"),
  planId: text("plan_id").notNull().default("free"),
  subscriptionStatus: text("subscription_status").notNull().default("none"),
  currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
  unsubscribed: boolean("unsubscribed").notNull().default(false),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertUserSchema = createInsertSchema(usersTable)
  .pick({ username: true })
  .extend({
    email: z.string().email().optional(),
    password: z.string().min(4, "Password must be at least 4 characters"),
  });

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;
