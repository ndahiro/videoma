import { requireSession } from "@/lib/session";
import { planPriceMap } from "@/lib/billing/prices";
import { SectionHeader } from "@/components/marketing/sections";
import { OnboardingClient } from "./onboarding-client";

/**
 * /onboarding — the post-signup step from CMSaasStarter: pick a plan, then
 * either continue on free or go to Stripe Checkout.
 */
export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ plan?: string }>;
}) {
  const { user, entitlements } = await requireSession();
  const { plan } = await searchParams;
  const configured = planPriceMap();

  return (
    <div className="px-8 py-12 max-w-5xl">
      <SectionHeader
        eyebrow={`Welcome, ${user.username}`}
        title="Pick a plan to get started"
        description="Nothing is charged until you choose a paid plan. You can switch at any time from the console, and the free tier stays available."
      />

      <div className="mt-10">
        <OnboardingClient
          preferredPlan={plan ?? "free"}
          currentPlan={entitlements.planId}
          billingEnabled={entitlements.billingEnabled}
          configuredPrices={Object.keys(configured)}
        />
      </div>
    </div>
  );
}
