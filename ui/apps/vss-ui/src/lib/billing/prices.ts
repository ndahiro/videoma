import { pricingPlans, type PlanId } from "@/lib/plans";

/**
 * Stripe price ids are environment-driven so the same image can be deployed to
 * test/live Stripe accounts. Ported from CMSaasStarter, where the equivalent
 * mapping lives in `pricing_plans.ts` as hard-coded ids.
 */
const PLAN_PRICE_ENV: Record<Exclude<PlanId, "free">, string> = {
  pro: "STRIPE_PRICE_PRO",
  scale: "STRIPE_PRICE_SCALE",
};

/** plan id -> stripe price id, for paid plans only. */
export function planPriceMap(): Record<string, string> {
  const map: Record<string, string> = {};
  for (const [planId, envName] of Object.entries(PLAN_PRICE_ENV)) {
    const value = process.env[envName]?.trim();
    if (value) map[planId] = value;
  }
  return map;
}

export function priceIdForPlan(planId: string): string | null {
  return planPriceMap()[planId] ?? null;
}

export function planForPriceId(priceId: string | null | undefined): PlanId | null {
  if (!priceId) return null;
  const entry = Object.entries(planPriceMap()).find(([, value]) => value === priceId);
  return entry ? (entry[0] as PlanId) : null;
}

/** Paid plans that are configured and therefore purchasable right now. */
export function purchasablePlanIds(): PlanId[] {
  const configured = planPriceMap();
  return pricingPlans
    .map((plan) => plan.id)
    .filter((planId) => planId !== "free" && Boolean(configured[planId]));
}

/** Plans offered on the pricing page: free + every configured paid plan. */
export function selectablePlanIds(): PlanId[] {
  return pricingPlans
    .map((plan) => plan.id)
    .filter((planId) => planId === "free" || Boolean(priceIdForPlan(planId)));
}
