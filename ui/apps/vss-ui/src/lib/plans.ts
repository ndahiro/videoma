/**
 * Pricing plans — the app-side source of truth.
 *
 * Ported from CMSaasStarter's `pricing_plans.ts`, extended with the metered
 * limits Videoma actually enforces (ingested video minutes + AI queries).
 *
 * Stripe price ids are NOT stored here: they come from the environment
 * (STRIPE_PRICE_PRO / STRIPE_PRICE_SCALE) and are resolved server-side by
 * `lib/billing/prices.ts`, so the browser bundle never carries billing ids and
 * the app keeps working with billing switched off.
 */

export const defaultPlanId = "free";

export type PlanId = "free" | "pro" | "scale";

export interface PlanLimits {
  /** Ingested video minutes per calendar month. `null` = unlimited. */
  videoMinutesPerMonth: number | null;
  /** Search / Q&A / summarize calls per calendar month. `null` = unlimited. */
  queriesPerMonth: number | null;
  /** Largest single upload, in minutes. */
  maxUploadMinutes: number;
  /** Longest single item the agent may summarize, in minutes. */
  maxSummarizeMinutes: number;
  /** Library size cap, in minutes. `null` = unlimited. */
  libraryMinutes: number | null;
  /** Named seats (informational — auth is per-account). */
  seats: number;
}

export interface Plan {
  id: PlanId;
  name: string;
  description: string;
  price: string;
  priceIntervalName: string;
  /** Tailwind accent for the pricing card. */
  badge?: string;
  featured?: boolean;
  features: string[];
  limits: PlanLimits;
}

export const pricingPlans: Plan[] = [
  {
    id: "free",
    name: "Free",
    description: "Kick the tyres on a small archive.",
    price: "$0",
    priceIntervalName: "forever",
    features: [
      "30 minutes of video indexed / month",
      "50 AI searches & questions / month",
      "4 search modes (semantic, temporal, object, transcript)",
      "20-minute uploads",
      "Community support",
    ],
    limits: {
      videoMinutesPerMonth: 30,
      queriesPerMonth: 50,
      maxUploadMinutes: 20,
      maxSummarizeMinutes: 20,
      libraryMinutes: 120,
      seats: 1,
    },
  },
  {
    id: "pro",
    name: "Pro",
    description: "For teams running a live library.",
    price: "$49",
    priceIntervalName: "per month",
    badge: "Most popular",
    featured: true,
    features: [
      "600 minutes of video indexed / month",
      "2,000 AI searches & questions / month",
      "Report generation (PDF / Word export)",
      "120-minute uploads",
      "5 seats",
      "Email support",
    ],
    limits: {
      videoMinutesPerMonth: 600,
      queriesPerMonth: 2000,
      maxUploadMinutes: 120,
      maxSummarizeMinutes: 120,
      libraryMinutes: 3000,
      seats: 5,
    },
  },
  {
    id: "scale",
    name: "Scale",
    description: "Whole-archive intelligence with room to grow.",
    price: "$199",
    priceIntervalName: "per month",
    features: [
      "3,000 minutes of video indexed / month",
      "20,000 AI searches & questions / month",
      "Unlimited library size",
      "8-hour uploads",
      "25 seats",
      "Priority support & onboarding",
    ],
    limits: {
      videoMinutesPerMonth: 3000,
      queriesPerMonth: 20000,
      maxUploadMinutes: 480,
      maxSummarizeMinutes: 480,
      libraryMinutes: null,
      seats: 25,
    },
  },
];

export function getPlan(planId: string | null | undefined): Plan {
  return (
    pricingPlans.find((plan) => plan.id === planId) ??
    pricingPlans.find((plan) => plan.id === defaultPlanId)!
  );
}

export function selectablePlanIds(): PlanId[] {
  return pricingPlans.map((plan) => plan.id);
}

export function isPaidPlan(planId: string | null | undefined): boolean {
  const plan = getPlan(planId);
  return plan.id !== defaultPlanId;
}

/** Human-readable limit, used across account + pricing UI. */
export function formatLimit(value: number | null, unit: string): string {
  return value === null ? `Unlimited ${unit}` : `${value.toLocaleString()} ${unit}`;
}

export function formatMinutes(minutes: number | null): string {
  if (minutes === null) return "Unlimited";
  if (minutes < 60) return `${minutes} min`;
  return `${(minutes / 60).toFixed(minutes % 60 === 0 ? 0 : 1)} h`;
}
