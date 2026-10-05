import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/session";
import { isBillingEnabled } from "@/lib/billing/stripe-rest";
import { planPriceMap } from "@/lib/billing/prices";
import {
  getStoredCustomerId,
  latestLocalSubscription,
} from "@/lib/billing/subscriptions";

/**
 * GET /api/billing/status
 *
 * The single source of truth the account pages and the console shell read:
 * current plan, subscription state, metered usage and the remaining allowance.
 */
export async function GET(req: NextRequest) {
  const session = await getApiSession(req);
  if (!session) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const { user, entitlements } = session;
  const subscription = await latestLocalSubscription(user.id);
  const customerId = isBillingEnabled() ? await getStoredCustomerId(user.id) : null;

  return NextResponse.json({
    plan: entitlements.planId,
    plan_name: entitlements.plan.name,
    price_label: entitlements.plan.price,
    price_interval: entitlements.plan.priceIntervalName,
    subscription_status: entitlements.status,
    is_active: entitlements.isActive,
    is_trialing: entitlements.isTrialing,
    is_past_due: entitlements.isPastDue,
    is_canceled: entitlements.isCanceled,
    cancel_at_period_end: subscription?.cancelAtPeriodEnd ?? false,
    current_period_end:
      entitlements.currentPeriodEnd?.toISOString() ??
      subscription?.currentPeriodEnd?.toISOString() ??
      null,
    billing_enabled: entitlements.billingEnabled,
    has_customer: Boolean(customerId),
    upgradeable_plans: entitlements.upgradeable,
    configured_prices: Object.keys(planPriceMap()),
    limits: entitlements.limits,
    usage: {
      video_minutes: entitlements.usage.videoMinutes,
      queries: entitlements.usage.queries,
      events: entitlements.usage.events,
      period_start: entitlements.usage.periodStart.toISOString(),
      period_end: entitlements.usage.periodEnd.toISOString(),
    },
    remaining: entitlements.remaining,
    percent_used: entitlements.percentUsed,
  });
}
