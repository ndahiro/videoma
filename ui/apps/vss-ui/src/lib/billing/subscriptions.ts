import {
  db,
  desc,
  eq,
  subscriptionsTable,
  stripeCustomersTable,
  usersTable,
} from "@/lib/db";
import {
  StripeError,
  stripeRequest,
  subscriptionPriceIds,
  type StripeSubscription,
} from "@/lib/billing/stripe-rest";
import { planForPriceId } from "@/lib/billing/prices";
import { isActiveStatus, invalidateEntitlements } from "@/lib/entitlements";
import type { PlanId } from "@/lib/plans";

/**
 * Stripe <-> Postgres bridge, ported from CMSaasStarter's
 * `subscription_helpers.server.ts` (getOrCreateCustomerId + fetchSubscription)
 * with one addition: every subscription we touch is written into the local
 * `subscriptions` table and mirrored onto `users.plan_id`, so the rest of the
 * app never has to call Stripe to answer "what plan is this account on".
 */

export interface StripeCustomerRow {
  userId: string;
  stripeCustomerId: string | null;
}

export async function getStoredCustomerId(userId: string): Promise<string | null> {
  const [row] = await db
    .select({ stripeCustomerId: stripeCustomersTable.stripeCustomerId })
    .from(stripeCustomersTable)
    .where(eq(stripeCustomersTable.userId, userId))
    .limit(1);
  return row?.stripeCustomerId ?? null;
}

export async function getOrCreateCustomerId(user: {
  id: string;
  email: string | null;
  fullName?: string | null;
  companyName?: string | null;
  website?: string | null;
}): Promise<string> {
  const existing = await getStoredCustomerId(user.id);
  if (existing) return existing;

  const customer = await stripeRequest<{ id: string }>("/customers", {
    email: user.email ?? undefined,
    name: user.fullName ?? user.email ?? "",
    metadata: {
      user_id: user.id,
      company_name: user.companyName ?? "",
      website: user.website ?? "",
    },
  });

  if (!customer?.id) throw new StripeError("Stripe customer creation failed.");

  // insert instead of upsert so we never overwrite an existing customer id.
  await db
    .insert(stripeCustomersTable)
    .values({ userId: user.id, stripeCustomerId: customer.id })
    .onConflictDoNothing();

  return customer.id;
}

export interface PrimarySubscription {
  subscription: StripeSubscription;
  planId: PlanId | null;
}

/**
 * Mirrors CMSaasStarter's fetchSubscription(): pick the first subscription in a
 * state we honour (active / trialing / past_due) and map its price to a plan.
 */
export async function fetchPrimarySubscription(customerId: string): Promise<{
  primary: PrimarySubscription | null;
  hasEverHadSubscription: boolean;
  unpriceable?: boolean;
}> {
  const list = await stripeRequest<{ data: StripeSubscription[] }>(
    "/subscriptions",
    { customer: customerId, limit: 100, status: "all" },
    "GET",
  );

  const subscriptions = list.data ?? [];
  const primary = subscriptions.find((subscription) =>
    isActiveStatus(subscription.status),
  );

  if (!primary) {
    return { primary: null, hasEverHadSubscription: subscriptions.length > 0 };
  }

  const { priceId } = subscriptionPriceIds(primary);
  const planId = planForPriceId(priceId);
  return {
    primary: { subscription: primary, planId },
    hasEverHadSubscription: subscriptions.length > 0,
    unpriceable: planId === null,
  };
}

/** Persist a Stripe subscription locally and mirror it onto the user row. */
export async function applySubscription(
  subscription: StripeSubscription,
  userId: string,
): Promise<{ planId: PlanId }> {
  const { priceId, productId } = subscriptionPriceIds(subscription);
  const mappedPlanId = planForPriceId(priceId);
  const active = isActiveStatus(subscription.status);
  // A lapsed subscription leaves the account on the free tier.
  const planId: PlanId = active && mappedPlanId ? mappedPlanId : "free";
  // Stripe moved `current_period_end` onto the subscription item in newer API
  // versions, so accept either location.
  const periodEndSeconds =
    subscription.current_period_end ??
    subscription.items?.data?.[0]?.current_period_end ??
    null;
  const periodEnd = periodEndSeconds ? new Date(periodEndSeconds * 1000) : null;

  const values = {
    id: subscription.id,
    userId,
    status: subscription.status,
    planId,
    priceId,
    productId,
    customerId:
      typeof subscription.customer === "string" ? subscription.customer : null,
    currentPeriodEnd: periodEnd,
    cancelAtPeriodEnd: Boolean(subscription.cancel_at_period_end),
    updatedAt: new Date(),
  };

  await db
    .insert(subscriptionsTable)
    .values(values)
    .onConflictDoUpdate({ target: subscriptionsTable.id, set: values });

  await db
    .update(usersTable)
    .set({
      planId,
      subscriptionStatus: subscription.status,
      currentPeriodEnd: periodEnd,
      updatedAt: new Date(),
    })
    .where(eq(usersTable.id, userId));

  invalidateEntitlements(userId);

  return { planId };
}

export async function markSubscriptionDeleted(
  subscriptionId: string,
  userId: string | null,
): Promise<void> {
  await db
    .update(subscriptionsTable)
    .set({
      status: "canceled",
      planId: "free",
      cancelAtPeriodEnd: false,
      updatedAt: new Date(),
    })
    .where(eq(subscriptionsTable.id, subscriptionId));

  if (userId) {
    await db
      .update(usersTable)
      .set({
        planId: "free",
        subscriptionStatus: "canceled",
        currentPeriodEnd: null,
        updatedAt: new Date(),
      })
      .where(eq(usersTable.id, userId));
    invalidateEntitlements(userId);
  }
}

export async function findUserByCustomerId(customerId: string): Promise<string | null> {
  const [row] = await db
    .select({ userId: stripeCustomersTable.userId })
    .from(stripeCustomersTable)
    .where(eq(stripeCustomersTable.stripeCustomerId, customerId))
    .limit(1);
  if (row?.userId) return row.userId;

  // Fall back to the metadata we attach when creating the customer.
  const customer = await stripeRequest<{ metadata?: Record<string, string> }>(
    `/customers/${customerId}`,
    {},
    "GET",
  );
  return customer?.metadata?.user_id ?? null;
}

export async function latestLocalSubscription(userId: string) {
  const [row] = await db
    .select()
    .from(subscriptionsTable)
    .where(eq(subscriptionsTable.userId, userId))
    .orderBy(desc(subscriptionsTable.updatedAt))
    .limit(1);
  return row ?? null;
}
