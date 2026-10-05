import { db, eq, sql, usageEventsTable, usersTable } from "@/lib/db";
import type { PlanId } from "@/lib/plans";

/**
 * Usage metering — the "product" half of the SaaS wrapper.
 *
 * Every billable action writes an append-only row into `usage_events`; monthly
 * totals are a SUM() over the current calendar month. Nothing is cached, so a
 * plan change takes effect on the next request.
 */

export type UsageKind = "ingest" | "search" | "query" | "summarize" | "process";
export type UsageUnit = "minutes" | "queries" | "jobs";

export const KIND_UNIT: Record<UsageKind, UsageUnit> = {
  ingest: "minutes",
  search: "queries",
  query: "queries",
  summarize: "queries",
  process: "queries",
};

export interface UsageSummary {
  /** Minutes of video ingested this month. */
  videoMinutes: number;
  /** AI calls (search / query / summarize / process) this month. */
  queries: number;
  /** Total events recorded this month. */
  events: number;
  periodStart: Date;
  periodEnd: Date;
}

export function currentPeriod(reference = new Date()): { start: Date; end: Date } {
  const start = new Date(
    Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth(), 1, 0, 0, 0, 0),
  );
  const end = new Date(
    Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth() + 1, 1, 0, 0, 0, 0),
  );
  return { start, end };
}

export async function recordUsage(input: {
  userId: string;
  kind: UsageKind;
  quantity?: number;
  videoId?: string | null;
  meta?: Record<string, unknown>;
}): Promise<void> {
  const quantity = Math.max(1, Math.round(input.quantity ?? 1));
  await db.insert(usageEventsTable).values({
    userId: input.userId,
    kind: input.kind,
    unit: KIND_UNIT[input.kind],
    quantity,
    videoId: input.videoId ?? null,
    meta: input.meta ?? null,
  });
}

export async function getMonthlyUsage(userId: string): Promise<UsageSummary> {
  const { start, end } = currentPeriod();

  const [totals] = await db
    .select({
      minutes: sql<number>`COALESCE(SUM(CASE WHEN ${usageEventsTable.unit} = 'minutes' THEN ${usageEventsTable.quantity} ELSE 0 END), 0)`,
      queries: sql<number>`COALESCE(SUM(CASE WHEN ${usageEventsTable.unit} <> 'minutes' THEN ${usageEventsTable.quantity} ELSE 0 END), 0)`,
      events: sql<number>`COUNT(*)`,
    })
    .from(usageEventsTable)
    .where(
      sql`${usageEventsTable.userId} = ${userId} AND ${usageEventsTable.createdAt} >= ${start.toISOString()} AND ${usageEventsTable.createdAt} < ${end.toISOString()}`,
    );

  return {
    videoMinutes: Number(totals?.minutes ?? 0),
    queries: Number(totals?.queries ?? 0),
    events: Number(totals?.events ?? 0),
    periodStart: start,
    periodEnd: end,
  };
}

export async function getUsageBreakdown(
  userId: string,
): Promise<Array<{ kind: string; unit: string; total: number }>> {
  const { start, end } = currentPeriod();
  const rows = await db
    .select({
      kind: usageEventsTable.kind,
      unit: usageEventsTable.unit,
      total: sql<number>`COALESCE(SUM(${usageEventsTable.quantity}), 0)`,
    })
    .from(usageEventsTable)
    .where(
      sql`${usageEventsTable.userId} = ${userId} AND ${usageEventsTable.createdAt} >= ${start.toISOString()} AND ${usageEventsTable.createdAt} < ${end.toISOString()}`,
    )
    .groupBy(usageEventsTable.kind, usageEventsTable.unit);

  return rows.map((row) => ({ ...row, total: Number(row.total) }));
}

/**
 * Reset a user's cached plan back to free — used when a subscription lapses.
 */
export async function downgradeUserToFree(userId: string): Promise<void> {
  await db
    .update(usersTable)
    .set({ planId: "free" satisfies PlanId, subscriptionStatus: "canceled" })
    .where(eq(usersTable.id, userId));
  const { invalidateEntitlements } = await import("@/lib/entitlements");
  invalidateEntitlements(userId);
}
