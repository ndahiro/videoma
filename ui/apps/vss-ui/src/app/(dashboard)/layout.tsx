import { ConsoleShell } from "@/components/layout/console-shell";
import { requireSession } from "@/lib/session";
import type { AccountSummary } from "@/lib/account-types";

/**
 * Console layout — the gated half of the app.
 *
 * This is the Next.js equivalent of CMSaasStarter's `(admin)/account/+layout.server.ts`:
 * the session is resolved on the server from the httpOnly cookie, the account's
 * plan + usage come straight from Postgres, and unauthenticated visitors are
 * redirected to /login before any console HTML is sent.
 */
export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, entitlements } = await requireSession();

  const account: AccountSummary = {
    username: user.username,
    email: user.email,
    role: user.role,
    planId: entitlements.planId,
    planName: entitlements.plan.name,
    status: entitlements.status,
    isPastDue: entitlements.isPastDue,
    isTrialing: entitlements.isTrialing,
    isCanceled: entitlements.isCanceled,
    billingEnabled: entitlements.billingEnabled,
    currentPeriodEnd: entitlements.currentPeriodEnd?.toISOString() ?? null,
    usage: {
      videoMinutes: entitlements.usage.videoMinutes,
      queries: entitlements.usage.queries,
    },
    limits: {
      videoMinutesPerMonth: entitlements.limits.videoMinutesPerMonth,
      queriesPerMonth: entitlements.limits.queriesPerMonth,
    },
    remaining: entitlements.remaining,
    percentUsed: entitlements.percentUsed,
  };

  return <ConsoleShell account={account}>{children}</ConsoleShell>;
}

