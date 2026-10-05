"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { pricingPlans, getPlan, formatLimit, type PlanId } from "@/lib/plans";
import {
  CARD_BRANDS,
  DEFAULT_CARD_BRAND,
  acceptedCardsLabel,
  type CardBrandId,
} from "@/lib/billing/payment-methods";

export interface BillingAccount {
  planId: string;
  planName: string;
  status: string;
  isPastDue: boolean;
  isCanceled: boolean;
  isTrialing: boolean;
  billingEnabled: boolean;
  configuredPrices: string[];
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  usage: { videoMinutes: number; queries: number };
  limits: { videoMinutesPerMonth: number | null; queriesPerMonth: number | null };
  remaining: { videoMinutes: number | null; queries: number | null };
  percentUsed: { videoMinutes: number; queries: number };
  periodStart: string;
  periodEnd: string;
}

export function BillingClient({
  account,
  checkoutState,
}: {
  account: BillingAccount;
  checkoutState: string | null;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = useState<string | null>(null);

  // Stripe redirects back here before the webhook lands; refresh the server
  // data a couple of times so the new plan shows up without a manual reload.
  useEffect(() => {
    if (checkoutState !== "success") return;
    const timers = [1500, 4000].map((delay) => setTimeout(() => router.refresh(), delay));
    return () => timers.forEach(clearTimeout);
  }, [checkoutState, router]);

  const post = async (path: string, body?: unknown, label?: string) => {
    setBusy(label ?? path);
    try {
      const res = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.url) {
        throw new Error(data?.message || "Stripe is unavailable right now.");
      }
      window.location.href = data.url as string;
    } catch (err) {
      toast({
        title: "Billing action failed",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
      setBusy(null);
    }
  };

  return (
    <div className="space-y-6">
      {checkoutState === "success" && (
        <div className="border border-ok/40 bg-ok/10 px-4 py-3 text-xs text-foreground">
          Payment received. Stripe is confirming the subscription — this page updates by itself
          within a few seconds.
        </div>
      )}
      {checkoutState === "cancelled" && (
        <div className="border border-border bg-card px-4 py-3 text-xs text-muted-foreground">
          Checkout was cancelled. Nothing was charged.
        </div>
      )}
      {!account.billingEnabled && (
        <div className="border border-warn/40 bg-warn/10 px-4 py-3 text-xs text-foreground">
          Billing is not configured on this deployment (no <code>STRIPE_SECRET_KEY</code>). The
          console runs on the plan set for the account — an administrator can change it from the
          admin console.
        </div>
      )}

      <Card>
        <CardHeader>
          <span className="eyebrow mb-1">Subscription</span>
          <CardTitle>{account.planName}</CardTitle>
          <CardDescription>
            {account.status === "none" || account.status === "free"
              ? "No paid subscription — the free tier limits apply."
              : `Stripe status: ${account.status}${
                  account.currentPeriodEnd
                    ? ` · renews ${new Date(account.currentPeriodEnd).toLocaleDateString()}`
                    : ""
                }${account.cancelAtPeriodEnd ? " · cancels at period end" : ""}`}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <UsageRow
            label="Video indexed"
            used={`${account.usage.videoMinutes.toLocaleString()} min`}
            limit={formatLimit(account.limits.videoMinutesPerMonth, "minutes")}
            percent={account.percentUsed.videoMinutes}
          />
          <UsageRow
            label="AI calls"
            used={account.usage.queries.toLocaleString()}
            limit={formatLimit(account.limits.queriesPerMonth, "calls")}
            percent={account.percentUsed.queries}
          />
          <p className="timecode text-[10px] text-muted-foreground">
            current period {new Date(account.periodStart).toLocaleDateString()} —{" "}
            {new Date(account.periodEnd).toLocaleDateString()}
          </p>

          <div className="flex flex-wrap gap-2 pt-1">
            <Button
              variant="outline"
              disabled={!account.billingEnabled || busy === "portal"}
              onClick={() => post("/api/billing/portal", undefined, "portal")}
            >
              {busy === "portal" ? "Opening Stripe…" : "Open billing portal"}
            </Button>
            {account.isPastDue && (
              <span className="self-center text-xs text-destructive">
                Payment failed — update the card in the portal.
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      <PlanChooser
        account={account}
        busy={busy}
        onChoose={(planId, cardBrand) =>
          post("/api/billing/checkout", { plan: planId, card_brand: cardBrand }, planId)
        }
      />
    </div>
  );
}


function UsageRow({
  label,
  used,
  limit,
  percent,
}: {
  label: string;
  used: string;
  limit: string;
  percent: number;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="eyebrow">{label}</span>
        <span className="timecode text-[11px] text-muted-foreground">
          {used} <span className="opacity-50">/ {limit}</span>
        </span>
      </div>
      <div className="mt-2 h-px w-full bg-border">
        <div
          className={cn(
            "h-px",
            percent >= 90 ? "bg-err" : percent >= 70 ? "bg-warn" : "bg-primary",
          )}
          style={{ width: `${Math.min(100, percent)}%` }}
        />
      </div>
    </div>
  );
}

function PlanChooser({
  account,
  busy,
  onChoose,
}: {
  account: BillingAccount;
  busy: string | null;
  onChoose: (planId: PlanId, cardBrand: CardBrandId) => void;
}) {
  const [cardBrand, setCardBrand] = useState<CardBrandId>(DEFAULT_CARD_BRAND);

  return (
    <section>
      <div className="flex items-end justify-between mb-4">
        <div>
          <span className="eyebrow">Plans</span>
          <h2 className="font-serif text-2xl tracking-editorial mt-1">Change plan</h2>
        </div>
        <span className="timecode text-[10px] text-muted-foreground">
          {account.billingEnabled ? "billed by Stripe" : "billing disabled"}
        </span>
      </div>

      <div className="border border-border bg-card/40 px-5 py-4 mb-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
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
        <p className="mt-2 timecode text-[9px] text-muted-foreground">
          Stripe detects the brand from your card number; Verve acceptance depends on Stripe
          support in your region.
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {pricingPlans.map((plan) => {
          const isCurrent = plan.id === account.planId;
          const configured = plan.id === "free" || account.configuredPrices.includes(plan.id);
          const disabled = isCurrent || !configured || busy !== null;

          return (
            <Card
              key={plan.id}
              className={cn(
                "flex flex-col",
                plan.featured && !isCurrent && "border-primary/50",
                isCurrent && "border-primary",
              )}
            >
              <CardHeader>
                <div className="flex items-center justify-between mb-1">
                  <span className="eyebrow">{plan.name}</span>
                  {plan.featured && !isCurrent && (
                    <span className="timecode text-[9px] uppercase text-primary">
                      {plan.badge ?? "Popular"}
                    </span>
                  )}
                  {isCurrent && (
                    <span className="timecode text-[9px] uppercase text-primary">current</span>
                  )}
                </div>
                <div className="flex items-baseline gap-1.5">
                  <span className="font-serif text-2xl tracking-editorial">{plan.price}</span>
                  <span className="text-[11px] text-muted-foreground">
                    {plan.priceIntervalName}
                  </span>
                </div>
                <CardDescription>{plan.description}</CardDescription>
              </CardHeader>
              <CardContent className="flex-1 flex flex-col justify-between gap-4">
                <ul className="space-y-1.5">
                  {plan.features.slice(0, 4).map((feature) => (
                    <li key={feature} className="text-xs text-muted-foreground flex gap-2">
                      <span className="text-primary">—</span>
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
                <Button
                  variant={isCurrent ? "outline" : plan.featured ? "default" : "outline"}
                  disabled={disabled}
                  onClick={() => onChoose(plan.id, cardBrand)}
                >
                  {isCurrent
                    ? "Current plan"
                    : !configured
                      ? "Not configured"
                      : busy === plan.id
                        ? "Redirecting…"
                        : account.planId === "free" || plan.id === "scale"
                          ? `Upgrade to ${plan.name}`
                          : `Switch to ${plan.name}`}
                </Button>
                {plan.id === "free" && !isCurrent && configured && (
                  <p className="timecode text-[9px] text-muted-foreground">
                    Downgrades are handled in the Stripe portal.
                  </p>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </section>
  );
}
