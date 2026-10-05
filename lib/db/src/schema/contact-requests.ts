import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

/**
 * contact_requests — submissions from the marketing contact form
 * (/contact). Mirrors CMSaasStarter's `contact_requests` table.
 */
export const contactRequestsTable = pgTable("contact_requests", {
  id: uuid("id").defaultRandom().primaryKey(),
  firstName: text("first_name"),
  lastName: text("last_name"),
  email: text("email"),
  phone: text("phone"),
  companyName: text("company_name"),
  messageBody: text("message_body"),
  source: text("source"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export type ContactRequest = typeof contactRequestsTable.$inferSelect;
