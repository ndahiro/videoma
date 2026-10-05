"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { pricingPlans, formatLimit } from "@/lib/plans";
import { acceptedCardsLabel } from "@/lib/billing/payment-methods";
import { useAuth } from "@/hooks/use-auth";

/**
 * Presentational blocks shared by the marketing pages. Server components: they
 * only read the static plan config, so the landing/pricing pages stay
 * pre-renderable (CMSaasStarter keeps its marketing site pre-rendered too).
 */

export function SectionHeader({
  eyebrow,
  title,
  description,
  className,
}: {
  eyebrow: string;
  title: React.ReactNode;
  description?: string;
  className?: string;
}) {
  return (
    <div className={cn("max-w-2xl", className)}>
      <div className="flex items-center gap-3 mb-4">
        <span className="eyebrow">{eyebrow}</span>
        <span className="hr-hairline w-12" />
      </div>
      <h2 className="font-serif text-[34px] leading-[1.1] tracking-editorial">{title}</h2>
      {description && (
        <p className="mt-4 text-sm text-muted-foreground leading-relaxed">{description}</p>
      )}
    </div>
  );
}

export function FeatureCard({
  index,
  title,
  body,
  href,
}: {
  index: string;
  title: string;
  body: string;
  href?: string;
}) {
  const content = (
    <>
      <div className="timecode text-[11px] text-primary">{index}</div>
      <h3 className="font-serif text-lg tracking-editorial mt-4">{title}</h3>
      <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{body}</p>
    </>
  );

  const className =
    "block border border-card-border bg-card p-6 transition-colors hover:border-primary/40";

  return href ? (
    <Link href={href} className={className}>
      {content}
    </Link>
  ) : (
    <div className={className}>{content}</div>
  );
}

export function Step({
  index,
  title,
  body,
}: {
  index: string;
  title: string;
  body: string;
}) {
  return (
    <div className="border-l border-border pl-6">
      <div className="timecode text-[11px] text-primary">{index}</div>
      <h3 className="font-serif text-lg tracking-editorial mt-3">{title}</h3>
      <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{body}</p>
    </div>
  );
}

function PlanCTA({
  plan,
  configured,
  ctaHref,
  ctaLabel,
}: {
  plan: (typeof pricingPlans)[number];
  configured: boolean;
  ctaHref?: string;
  ctaLabel?: string;
}) {
  const router = useRouter ? useRouter() : null;
  const { token, isAuthenticated } = useAuth();
  const [loading, setLoading] = useState(false);

  const defaultHref = plan.id === "free" ? "/register" : `/register?plan=${plan.id}`;
  const href = ctaHref ?? defaultHref;
  const label = ctaLabel ?? (plan.id === "free" ? "Start free" : `Choose ${plan.name}`);

  if (plan.id === "free" || !isAuthenticated || !router) {
    return (
      <Link
        href={href}
        className={cn(
          "mt-5 inline-flex h-11 items-center justify-center text-sm font-medium transition-colors",
          plan.featured
            ? "bg-primary text-primary-foreground hover:bg-primary/90"
            : "border border-border text-foreground hover:border-foreground/30 hover:bg-card",
        )}
      >
        {label}
      </Link>
    );
  }

  const handleUpgrade = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ plan: plan.id }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || "Could not start checkout.");
      }
      router.push(data.url);
    } catch (err) {
      console.error("Checkout failed:", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handleUpgrade}
      disabled={loading || !configured}
      className={cn(
        "mt-5 inline-flex h-11 items-center justify-center text-sm font-medium transition-colors",
        plan.featured
          ? "bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          : "border border-border text-foreground hover:border-foreground/30 hover:bg-card disabled:opacity-50",
      )}
    >
      {loading ? "Redirecting…" : label}
    </button>
  );
}

export function PlanCard({
  plan,
  configured,
  ctaHref,
  ctaLabel,
}: {
  plan: (typeof pricingPlans)[number];
  configured: boolean;
  ctaHref?: string;
  ctaLabel?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col border bg-card p-7",
        plan.featured ? "border-primary/60" : "border-card-border",
      )}
    >
      <div className="flex items-center justify-between">
        <span className="eyebrow">{plan.name}</span>
        {plan.featured && (
          <span className="timecode text-[9px] uppercase text-primary">
            {plan.badge ?? "Popular"}
          </span>
        )}
      </div>

      <div className="mt-5 flex items-baseline gap-2">
        <span className="font-serif text-4xl tracking-editorial">{plan.price}</span>
        <span className="text-xs text-muted-foreground">{plan.priceIntervalName}</span>
      </div>

      <p className="mt-3 text-xs text-muted-foreground leading-relaxed">{plan.description}</p>

      <ul className="mt-6 space-y-2 flex-1">
        {plan.features.map((feature) => (
          <li key={feature} className="flex gap-2 text-sm text-muted-foreground">
            <span className="text-primary shrink-0">—</span>
            <span>{feature}</span>
          </li>
        ))}
      </ul>

      <div className="mt-6 hr-hairline pt-4 timecode text-[10px] text-muted-foreground">
        {formatLimit(plan.limits.videoMinutesPerMonth, "min indexing")} ·{" "}
        {formatLimit(plan.limits.queriesPerMonth, "AI calls")}
      </div>

      <PlanCTA plan={plan} configured={configured} ctaHref={ctaHref} ctaLabel={ctaLabel} />

      {plan.id !== "free" && (
        <p className="mt-2 timecode text-[9px] text-muted-foreground">
          Card checkout: {acceptedCardsLabel()}
        </p>
      )}
      {!configured && plan.id !== "free" && (
        <p className="mt-2 timecode text-[9px] text-muted-foreground">
          Stripe price not configured — contact us for this plan.
        </p>
      )}
    </div>
  );
}
