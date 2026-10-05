"use client";

import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { Sidebar } from "@/components/layout/sidebar";
import type { AccountSummary } from "@/lib/account-types";

export type { AccountSummary };

/**
 * Client shell for the authenticated console. Rendered by the server layout
 * ((dashboard)/layout.tsx) once the session has been resolved and the account's
 * plan has been loaded.
 */
export function ConsoleShell({
  account,
  children,
}: {
  account: AccountSummary;
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-screen bg-background overflow-hidden text-foreground selection:bg-primary/30">
      <Sidebar account={account} />
      <main className="flex-1 overflow-y-auto relative flex flex-col">
        <BillingBanner account={account} />
        {children}
      </main>
    </div>
  );
}

/**
 * Plan state banner: the direct port of CMSaasStarter's "past due" /
 * "no subscription" nudges that sit above the dashboard content.
 */
function BillingBanner({ account }: { account: AccountSummary }) {
  if (account.isPastDue) {
    return (
      <div className="flex items-center gap-3 border-b border-destructive/40 bg-destructive/10 px-8 py-3 text-xs text-destructive">
        <AlertTriangle className="w-3.5 h-3.5 shrink-0" strokeWidth={1.75} />
        <span className="flex-1">
          Your last payment failed. Access continues while Stripe retries — update the card to
          avoid dropping to the free plan.
        </span>
        <Link
          href="/account/billing"
          className="underline underline-offset-4 hover:no-underline shrink-0"
        >
          Fix billing
        </Link>
      </div>
    );
  }

  if (account.isCanceled) {
    return (
      <div className="flex items-center gap-3 border-b border-border bg-card px-8 py-3 text-xs text-muted-foreground">
        <span className="rec-dot shrink-0" />
        <span className="flex-1">
          Your subscription ended, so the account is on the {account.planName} plan.
        </span>
        <Link
          href="/account/billing"
          className="text-primary underline underline-offset-4 hover:no-underline shrink-0"
        >
          Resubscribe
        </Link>
      </div>
    );
  }

  if (account.isTrialing) {
    return (
      <div className="flex items-center gap-3 border-b border-primary/40 bg-primary/10 px-8 py-3 text-xs text-foreground">
        <span className="eyebrow text-primary shrink-0">Trial</span>
        <span className="flex-1">
          Your {account.planName} trial is running
          {account.currentPeriodEnd
            ? ` until ${new Date(account.currentPeriodEnd).toLocaleDateString()}`
            : ""}
          .
        </span>
        <Link
          href="/account/billing"
          className="underline underline-offset-4 hover:no-underline shrink-0"
        >
          Manage
        </Link>
      </div>
    );
  }

  return null;
}
