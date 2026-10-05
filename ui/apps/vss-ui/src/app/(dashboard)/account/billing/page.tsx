import Link from "next/link";
import { requireSession } from "@/lib/session";
import { latestLocalSubscription } from "@/lib/billing/subscriptions";
import { planPriceMap } from "@/lib/billing/prices";
import { PageHeader } from "@/components/layout/page-header";
import { BillingClient } from "./billing-client";

/**
 * /account/billing — the port of CMSaasStarter's
 * `(admin)/account/(menu)/billing` page: current plan, usage, upgrade buttons
 * and the link into the Stripe billing portal.
 */
export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ checkout?: string }>;
}) {
  const { user, entitlements } = await requireSession();
  const { checkout } = await searchParams;
  const subscription = await latestLocalSubscription(user.id);

  return (
    <div>
      <PageHeader
        index="A2"
        title="Plan & billing"
        description="Your subscription, this month's metered usage, and the way to change either."
        meta="Workspace"
        actions={
          <Link
            href="/pricing"
            className="text-xs text-primary underline underline-offset-4 hover:no-underline"
          >
            Compare plans
          </Link>
        }
      />

      <section className="px-8 py-8 max-w-4xl">
        <BillingClient
          account={{
            planId: entitlements.planId,
            planName: entitlements.plan.name,
            status: entitlements.status,
            isPastDue: entitlements.isPastDue,
            isCanceled: entitlements.isCanceled,
            isTrialing: entitlements.isTrialing,
            billingEnabled: entitlements.billingEnabled,
            configuredPrices: Object.keys(planPriceMap()),
            currentPeriodEnd: entitlements.currentPeriodEnd?.toISOString() ?? null,
            cancelAtPeriodEnd: subscription?.cancelAtPeriodEnd ?? false,
            usage: {
              videoMinutes: entitlements.usage.videoMinutes,
              queries: entitlements.usage.queries,
            },
            limits: {
              videoMinutesPerMonth: entitlements.limits.videoMinutesPerMonth,
              queriesPerMonth: entitlements.limits.queriesPerMonth,
            },
            remaining: entitlements.remaining,
            percentUsed: entitlements.percentUsed,
            periodStart: entitlements.usage.periodStart.toISOString(),
            periodEnd: entitlements.usage.periodEnd.toISOString(),
          }}
          checkoutState={checkout ?? null}
        />
      </section>
    </div>
  );
}
