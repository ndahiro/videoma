import { requireSession } from "@/lib/session";
import { latestLocalSubscription } from "@/lib/billing/subscriptions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/layout/page-header";
import { AccountClient } from "./account-client";
import Link from "next/link";
import { CreditCard } from "lucide-react";

/**
 * /account — profile, password and plan summary.
 * The Next.js counterpart of CMSaasStarter's `(admin)/account/(menu)` area.
 */
export default async function AccountPage() {
  const { user, entitlements } = await requireSession();
  const subscription = await latestLocalSubscription(user.id);

  return (
    <div>
      <PageHeader
        index="A1"
        title="Account"
        description="Profile, credentials and the plan this workspace runs on."
        meta="Workspace"
        actions={
          <Button asChild variant="outline" className="gap-2">
            <Link href="/account/billing">
              <CreditCard className="w-4 h-4" strokeWidth={1.75} />
              Plan & billing
            </Link>
          </Button>
        }
      />

      <section className="px-8 py-8 grid gap-6 lg:grid-cols-[1.2fr_1fr] items-start">
        <AccountClient
          profile={{
            username: user.username,
            email: user.email,
            fullName: user.fullName,
            companyName: user.companyName,
            website: user.website,
          }}
        />

        <Card>
          <CardHeader>
            <span className="eyebrow mb-1">Current plan</span>
            <CardTitle>{entitlements.plan.name}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="flex items-baseline gap-2">
              <span className="font-serif text-3xl tracking-editorial">
                {entitlements.plan.price}
              </span>
              <span className="text-xs text-muted-foreground">
                {entitlements.plan.priceIntervalName}
              </span>
            </div>

            <dl className="text-xs space-y-2">
              <Row label="Status" value={entitlements.status} />
              <Row
                label="Renews"
                value={
                  entitlements.currentPeriodEnd
                    ? new Date(entitlements.currentPeriodEnd).toLocaleDateString()
                    : "—"
                }
              />
              <Row
                label="Indexed this month"
                value={`${entitlements.usage.videoMinutes} min`}
              />
              <Row label="AI calls this month" value={String(entitlements.usage.queries)} />
              <Row label="Billing" value={entitlements.billingEnabled ? "Stripe connected" : "Not configured"} />
            </dl>

            {subscription && (
              <div className="hr-hairline pt-3 text-[11px] text-muted-foreground">
                Stripe subscription {subscription.id}
                {subscription.cancelAtPeriodEnd ? " · cancels at period end" : ""}
              </div>
            )}

            <Button asChild className="w-full gap-2">
              <Link href="/account/billing">
                {entitlements.planId === "free" ? "Choose a plan" : "Manage subscription"}
              </Link>
            </Button>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

function Row({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="eyebrow">{label}</dt>
      <dd className="timecode text-[11px] text-foreground uppercase truncate">{value}</dd>
    </div>
  );
}
