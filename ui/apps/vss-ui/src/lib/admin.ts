import { db, contactRequestsTable, desc, usageEventsTable, usersTable } from "@/lib/db";
import { sql } from "@/lib/db";
import { currentPeriod } from "@/lib/usage";

/**
 * Shared admin queries. Used by both the admin page (server component) and the
 * /api/admin routes, so the console and the API always agree.
 */

export interface AdminAccount {
  id: string;
  username: string;
  email: string | null;
  role: string;
  planId: string;
  subscriptionStatus: string;
  currentPeriodEnd: Date | null;
  createdAt: Date;
  lastLoginAt: Date | null;
  usage: { minutes: number; queries: number };
}

export async function listAccounts(
  options: { search?: string; plan?: string; limit?: number } = {},
): Promise<{ accounts: AdminAccount[]; period: { start: Date; end: Date } }> {
  const limit = Math.min(Math.max(options.limit ?? 100, 1), 500);

  const users = await db
    .select({
      id: usersTable.id,
      username: usersTable.username,
      email: usersTable.email,
      role: usersTable.role,
      planId: usersTable.planId,
      subscriptionStatus: usersTable.subscriptionStatus,
      currentPeriodEnd: usersTable.currentPeriodEnd,
      createdAt: usersTable.createdAt,
      lastLoginAt: usersTable.lastLoginAt,
    })
    .from(usersTable)
    .where(
      options.search
        ? sql`${usersTable.username} ILIKE ${"%" + options.search + "%"} OR COALESCE(${usersTable.email}, '') ILIKE ${"%" + options.search + "%"}`
        : options.plan
          ? sql`${usersTable.planId} = ${options.plan}`
          : sql`TRUE`,
    )
    .orderBy(desc(usersTable.createdAt))
    .limit(limit);

  const period = currentPeriod();
  const usageRows = await db
    .select({
      userId: usageEventsTable.userId,
      minutes: sql<number>`COALESCE(SUM(CASE WHEN ${usageEventsTable.unit} = 'minutes' THEN ${usageEventsTable.quantity} ELSE 0 END), 0)`,
      queries: sql<number>`COALESCE(SUM(CASE WHEN ${usageEventsTable.unit} <> 'minutes' THEN ${usageEventsTable.quantity} ELSE 0 END), 0)`,
    })
    .from(usageEventsTable)
    .where(
      sql`${usageEventsTable.createdAt} >= ${period.start.toISOString()} AND ${usageEventsTable.createdAt} < ${period.end.toISOString()}`,
    )
    .groupBy(usageEventsTable.userId);

  const usageByUser = new Map(
    usageRows.map((row) => [
      row.userId,
      { minutes: Number(row.minutes), queries: Number(row.queries) },
    ]),
  );

  return {
    accounts: users.map((user) => ({
      ...user,
      usage: usageByUser.get(user.id) ?? { minutes: 0, queries: 0 },
    })),
    period,
  };
}

export async function listContactRequests(limit = 50) {
  return db
    .select()
    .from(contactRequestsTable)
    .orderBy(desc(contactRequestsTable.createdAt))
    .limit(limit);
}
