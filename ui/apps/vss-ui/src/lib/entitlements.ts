import { db, eq, usersTable } from "@/lib/db";
import { getPlan, type Plan, type PlanId, type PlanLimits } from "@/lib/plans";
import { getMonthlyUsage, type UsageKind, type UsageSummary } from "@/lib/usage";
import { isBillingEnabled } from "@/lib/billing/stripe-rest";
import { priceIdForPlan } from "@/lib/billing/prices";

/**
 * Entitlements — "what is this account allowed to do right now".
 *
 * CMSaasStarter asks Stripe on every dashboard load and treats any active
 * subscription as the entitlement. We apply the same rule, but against the
 * local `users`/`subscriptions` mirror, so gating is a single Postgres read and
 * keeps working offline. The billing page still reconciles with Stripe when a
 * key is configured.
 *
 * NOTE: server-only module — never import from a client component.
 */

export const ACTIVE_STATUSES = ["active", "trialing", "past_due"] as const;
const GRACE_STATUSES = ["past_due", "unpaid"] as const;

export function isActiveStatus(status: string | null | undefined): boolean {
  return ACTIVE_STATUSES.includes((status ?? "") as (typeof ACTIVE_STATUSES)[number]);
}

export function isGraceStatus(status: string | null | undefined): boolean {
  return GRACE_STATUSES.includes((status ?? "") as (typeof GRACE_STATUSES)[number]);
}

export interface Entitlements {
  plan: Plan;
  planId: PlanId;
  limits: PlanLimits;
  status: string;
  /** True when the paid plan is currently in force (or the plan is free). */
  isActive: boolean;
  /** True when the plan is a trial. */
  isTrialing: boolean;
  /** True when payment failed but we are still honouring the plan. */
  isPastDue: boolean;
  /** True when the account subscribed in the past and no longer does. */
  isCanceled: boolean;
  billingEnabled: boolean;
  /** Paid plans that have a Stripe price configured. */
  upgradeable: PlanId[];
  currentPeriodEnd: Date | null;
  usage: UsageSummary;
  remaining: {
    videoMinutes: number | null;
    queries: number | null;
  };
  percentUsed: {
    videoMinutes: number;
    queries: number;
  };
}

function percentUsed(used: number, limit: number | null): number {
  if (limit === null || limit <= 0) return 0;
  return Math.min(100, Math.round((used / limit) * 100));
}

// ---------------------------------------------------------------------------
// Short-TTL in-process cache.
//
// getEntitlements() runs on nearly every API request (session build) and costs
// 2 DB round-trips (user row + monthly usage SUM). Under high concurrency
// that dominates Postgres load. Cache per user for a few seconds:
//   ENTITLEMENTS_CACHE_TTL_MS — default 20000, 0 disables the cache.
// Writes that change gating (Stripe webhook, admin plan changes) call
// invalidateEntitlements(), so upgrades/downgrades apply immediately and the
// TTL only absorbs read bursts. Single-instance only; with multiple app
// instances each holds its own copy for at most TTL.
// ---------------------------------------------------------------------------

interface EntitlementsCacheEntry {
  expiresAt: number;
  entitlements: Entitlements;
}

const entitlementsCache = new Map<string, EntitlementsCacheEntry>();

function entitlementsCacheTtlMs(): number {
  const raw = Number(process.env.ENTITLEMENTS_CACHE_TTL_MS);
  if (Number.isFinite(raw) && raw >= 0) return Math.floor(raw);
  return 20_000;
}

/** Drop a user's cached entitlements so the next read is fresh. */
export function invalidateEntitlements(userId: string): void {
  entitlementsCache.delete(userId);
}

setInterval(
  () => {
    const now = Date.now();
    for (const [userId, entry] of entitlementsCache) {
      if (entry.expiresAt <= now) entitlementsCache.delete(userId);
      // Bound memory even if TTLs are long and user count is huge.
      if (entitlementsCache.size > 50_000) break;
    }
  },
  60_000,
).unref?.();

export async function getEntitlements(userId: string): Promise<Entitlements> {
  const ttlMs = entitlementsCacheTtlMs();
  if (ttlMs > 0) {
    const cached = entitlementsCache.get(userId);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.entitlements;
    }
  }

  const [user] = await db
    .select({
      id: usersTable.id,
      planId: usersTable.planId,
      subscriptionStatus: usersTable.subscriptionStatus,
      currentPeriodEnd: usersTable.currentPeriodEnd,
    })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);

  const status = user?.subscriptionStatus ?? "none";
  const storedPlanId = (user?.planId ?? "free") as PlanId;

  // If a paid plan lapsed, fall back to free for gating purposes without
  // mutating the row (the webhook owns persistence).
  const active = isActiveStatus(status);
  const effectivePlanId: PlanId =
    storedPlanId === "free" || active ? storedPlanId : "free";
  const plan = getPlan(effectivePlanId);

  const usage = await getMonthlyUsage(userId);
  const { videoMinutesPerMonth, queriesPerMonth } = plan.limits;

  const upgradeable = (["pro", "scale"] as PlanId[]).filter((planId) =>
    Boolean(priceIdForPlan(planId)),
  );

  const entitlements: Entitlements = {
    plan,
    planId: effectivePlanId,
    limits: plan.limits,
    status,
    isActive: active || effectivePlanId === "free",
    isTrialing: status === "trialing",
    isPastDue: isGraceStatus(status),
    isCanceled: !active && status !== "none",
    billingEnabled: isBillingEnabled(),
    upgradeable,
    currentPeriodEnd: user?.currentPeriodEnd ?? null,
    usage,
    remaining: {
      videoMinutes:
        videoMinutesPerMonth === null
          ? null
          : Math.max(0, videoMinutesPerMonth - usage.videoMinutes),
      queries:
        queriesPerMonth === null ? null : Math.max(0, queriesPerMonth - usage.queries),
    },
    percentUsed: {
      videoMinutes: percentUsed(usage.videoMinutes, videoMinutesPerMonth),
      queries: percentUsed(usage.queries, queriesPerMonth),
    },
  };

  if (ttlMs > 0) {
    entitlementsCache.set(userId, {
      expiresAt: Date.now() + ttlMs,
      entitlements,
    });
  }

  return entitlements;
}

export interface QuotaDecision {
  allowed: boolean;
  /** Machine-readable reason when blocked. */
  reason?:
    | "video_minutes_exhausted"
    | "queries_exhausted"
    | "upload_too_long"
    | "summarize_too_long"
    | "library_full";
  message?: string;
  upgradeTo?: PlanId;
}

/**
 * Quota check for one action. `requestedMinutes` matters for ingest; the
 * search/query/summarize routes pass the default of 1 call.
 */
export function checkQuota(
  entitlements: Entitlements,
  kind: UsageKind,
  options: { requestedMinutes?: number; libraryMinutes?: number } = {},
): QuotaDecision {
  const { limits, usage } = entitlements;

  if (kind === "ingest") {
    const requested = options.requestedMinutes ?? 0;
    if (requested > limits.maxUploadMinutes) {
      return {
        allowed: false,
        reason: "upload_too_long",
        message: `This plan accepts uploads up to ${limits.maxUploadMinutes} minutes.`,
        upgradeTo: "pro",
      };
    }
    if (
      limits.videoMinutesPerMonth !== null &&
      usage.videoMinutes + requested > limits.videoMinutesPerMonth
    ) {
      return {
        allowed: false,
        reason: "video_minutes_exhausted",
        message: `Monthly indexing allowance reached (${limits.videoMinutesPerMonth} minutes).`,
        upgradeTo: "pro",
      };
    }
    if (
      limits.libraryMinutes !== null &&
      options.libraryMinutes !== undefined &&
      options.libraryMinutes + requested > limits.libraryMinutes
    ) {
      return {
        allowed: false,
        reason: "library_full",
        message: `This plan holds ${limits.libraryMinutes} minutes in the library.`,
        upgradeTo: "scale",
      };
    }
    return { allowed: true };
  }

  if (limits.queriesPerMonth !== null && usage.queries >= limits.queriesPerMonth) {
    return {
      allowed: false,
      reason: "queries_exhausted",
      message: `Monthly AI allowance reached (${limits.queriesPerMonth} calls).`,
      upgradeTo: "pro",
    };
  }

  return { allowed: true };
}

/** Local-only bookkeeping so a single request can check quota more than once. */
export function addUsage(
  entitlements: Entitlements,
  kind: UsageKind,
  quantity = 1,
): void {
  if (kind === "ingest") {
    entitlements.usage.videoMinutes += quantity;
  } else {
    entitlements.usage.queries += quantity;
  }
  entitlements.usage.events += 1;
}

