"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { pricingPlans, formatLimit } from "@/lib/plans";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import {
  CARD_BRANDS,
  DEFAULT_CARD_BRAND,
  acceptedCardsLabel,
  type CardBrandId,
} from "@/lib/billing/payment-methods";

/**
 * Plan selection step. Free continues straight into the console; a paid plan
 * opens Stripe Checkout (the webhook then flips the account onto that plan).
 */
export function OnboardingClient({
  preferredPlan,
  currentPlan,
  billingEnabled,
  configuredPrices,
}: {
  preferredPlan: string;
  currentPlan: string;
  billingEnabled: boolean;
  configuredPrices: string[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [cardBrand, setCardBrand] = useState<CardBrandId>(DEFAULT_CARD_BRAND);

  const choose = async (planId: string) => {
    if (planId === "free") {
      router.push("/dashboard");
      return;
    }

    setBusy(planId);
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: planId, card_brand: cardBrand }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.url) {
        throw new Error(data?.message || "Could not start checkout.");
      }
      window.location.href = data.url as string;
    } catch (err) {
      toast({
        title: "Checkout unavailable",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
      setBusy(null);
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3 border border-border bg-card/40 px-5 py-4">
        <div>
          <span className="eyebrow">Pay with card</span>
          <p className="mt-1 text-xs text-muted-foreground">
            Choose the card you will use at Stripe checkout — {acceptedCardsLabel()}.
          </p>
        </div>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Card brand">
          {CARD_BRANDS.map((brand) => {
            const selected = brand.id === cardBrand;
            return (
              <button
                key={brand.id}
                type="button"
                role="radio"
                aria-checked={selected}
                title={brand.hint}
                disabled={busy !== null}
                onClick={() => setCardBrand(brand.id)}
                className={cn(
                  "border px-3 py-1.5 text-xs transition-colors disabled:opacity-50",
                  selected
                    ? "border-primary bg-primary/10 text-foreground"
                    : "border-border text-muted-foreground hover:border-foreground/30 hover:bg-card",
                )}
              >
                {brand.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid gap-5 md:grid-cols-3">
        {pricingPlans.map((plan) => {
          const configured = plan.id === "free" || configuredPrices.includes(plan.id);
          const isPreferred = plan.id === preferredPlan;
          const isCurrent = plan.id === currentPlan;

          return (
            <div
              key={plan.id}
              className={cn(
                "flex flex-col border bg-card p-6",
                isPreferred && !isCurrent ? "border-primary" : "border-card-border",
              )}
            >
              <div className="flex items-center justify-between">
                <span className="eyebrow">{plan.name}</span>
                {isPreferred && !isCurrent && (
                  <span className="timecode text-[9px] uppercase text-primary">selected</span>
                )}
                {isCurrent && (
                  <span className="timecode text-[9px] uppercase text-muted-foreground">
                    current
                  </span>
                )}
              </div>

              <div className="mt-4 flex items-baseline gap-2">
                <span className="font-serif text-3xl tracking-editorial">{plan.price}</span>
                <span className="text-[11px] text-muted-foreground">
                  {plan.priceIntervalName}
                </span>
              </div>

              <ul className="mt-5 space-y-1.5 flex-1">
                <li className="text-xs text-muted-foreground flex gap-2">
                  <span className="text-primary">—</span>
                  <span>{formatLimit(plan.limits.videoMinutesPerMonth, "min indexing")}</span>
                </li>
                <li className="text-xs text-muted-foreground flex gap-2">
                  <span className="text-primary">—</span>
                  <span>{formatLimit(plan.limits.queriesPerMonth, "AI calls")}</span>
                </li>
                <li className="text-xs text-muted-foreground flex gap-2">
                  <span className="text-primary">—</span>
                  <span>{plan.limits.maxUploadMinutes} min max upload</span>
                </li>
              </ul>

              <Button
                className="mt-5"
                variant={plan.featured ? "default" : "outline"}
                disabled={!configured || busy !== null || isCurrent}
                onClick={() => choose(plan.id)}
              >
                {isCurrent
                  ? "On this plan"
                  : !configured
                    ? "Not configured"
                    : busy === plan.id
                      ? "Opening Stripe…"
                      : plan.id === "free"
                        ? "Continue on Free"
                        : `Choose ${plan.name}`}
              </Button>
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4 border border-border bg-card/40 px-5 py-4">
        <p className="text-xs text-muted-foreground max-w-xl leading-relaxed">
          {billingEnabled
            ? "Paid plans are billed by Stripe, cancel any time from the billing portal."
            : "Billing is not configured on this deployment, so paid plans are unavailable — start on Free and an administrator can raise the plan later."}
        </p>
        <Link
          href="/dashboard"
          className="text-xs text-primary underline underline-offset-4 hover:no-underline"
        >
          Skip for now
        </Link>
      </div>
    </div>
  );
}
