import Link from "next/link";
import type { Metadata } from "next";
import { PlanCard, SectionHeader } from "@/components/marketing/sections";
import { pricingPlans, formatLimit } from "@/lib/plans";
import { planPriceMap } from "@/lib/billing/prices";

export const metadata: Metadata = {
  title: "Pricing — Videoma",
  description:
    "Simple plans metered on video minutes indexed and AI calls answered. Start free, upgrade when the archive grows.",
};

const COMPARISON_ROWS: Array<{ label: string; value: (plan: (typeof pricingPlans)[number]) => string }> = [
  { label: "Video indexed / month", value: (plan) => formatLimit(plan.limits.videoMinutesPerMonth, "min") },
  { label: "AI calls / month", value: (plan) => formatLimit(plan.limits.queriesPerMonth, "calls") },
  { label: "Max single upload", value: (plan) => formatLimit(plan.limits.maxUploadMinutes, "min") },
  { label: "Library size", value: (plan) => formatLimit(plan.limits.libraryMinutes, "min") },
  { label: "Seats", value: (plan) => String(plan.limits.seats) },
];

/**
 * Pricing page — port of CMSaasStarter's `(marketing)/pricing`, driven by
 * `src/lib/plans.ts` so the marketing copy and the enforced quotas can never
 * drift apart.
 */
export default function PricingPage() {
  const configured = planPriceMap();

  return (
    <div>
      <section className="border-b border-border">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <SectionHeader
            eyebrow="Pricing"
            title="Pay for the minutes you index"
            description="Every plan includes the full console — library, search, Q&A and summaries. Limits apply to video minutes indexed and AI calls answered each calendar month."
          />

          <div className="mt-14 grid gap-6 md:grid-cols-3">
            {pricingPlans.map((plan) => (
              <PlanCard
                key={plan.id}
                plan={plan}
                configured={plan.id === "free" || Boolean(configured[plan.id])}
              />
            ))}
          </div>

          <p className="mt-6 timecode text-[10px] text-muted-foreground">
            Checkout is handled by Stripe. Pay with Verve, Visa, Mastercard or Amex — cancel
            or change a card at any time from the billing portal; unused allowance does not
            roll over.
          </p>
        </div>
      </section>

      <section className="border-b border-border">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <SectionHeader eyebrow="Comparison" title="What changes between plans" />

          <div className="mt-10 overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse">
              <thead>
                <tr className="border-b border-border">
                  <th className="eyebrow text-left py-4 pr-6">Limit</th>
                  {pricingPlans.map((plan) => (
                    <th key={plan.id} className="text-left py-4 px-6">
                      <div className="font-serif text-lg tracking-editorial">{plan.name}</div>
                      <div className="timecode text-[10px] text-muted-foreground">
                        {plan.price} {plan.priceIntervalName}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {COMPARISON_ROWS.map((row) => (
                  <tr key={row.label} className="border-b border-border">
                    <td className="py-4 pr-6 text-sm text-muted-foreground">{row.label}</td>
                    {pricingPlans.map((plan) => (
                      <td key={plan.id} className="py-4 px-6 timecode text-[12px] text-foreground">
                        {row.value(plan)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-12 grid gap-6 md:grid-cols-2">
            <div className="border border-card-border bg-card p-6">
              <div className="eyebrow mb-3">Already have an account?</div>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Plans are managed from the console: switch, upgrade or cancel without leaving the
                app.
              </p>
              <Link
                href="/account/billing"
                className="mt-4 inline-flex h-10 items-center border border-border px-5 text-sm hover:border-foreground/30 transition-colors"
              >
                Open plan & billing
              </Link>
            </div>
            <div className="border border-card-border bg-card p-6">
              <div className="eyebrow mb-3">Need more?</div>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Self-hosted deployments can meter against their own GPU pool. Tell us the archive
                size and retention window and we will shape a plan around it.
              </p>
              <Link
                href="/contact"
                className="mt-4 inline-flex h-10 items-center border border-border px-5 text-sm hover:border-foreground/30 transition-colors"
              >
                Contact sales
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
