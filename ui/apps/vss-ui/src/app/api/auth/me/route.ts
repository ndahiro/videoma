import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/session";

/**
 * GET /api/auth/me
 *
 * Returns the signed-in account together with its plan + metered usage, which
 * is what the console shell and the account pages render. Accepts either the
 * session cookie or a bearer token.
 */
export async function GET(req: NextRequest) {
  const session = await getApiSession(req);

  if (!session) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const { user, entitlements } = session;

  return NextResponse.json({
    id: user.id,
    username: user.username,
    email: user.email,
    full_name: user.fullName,
    company_name: user.companyName,
    website: user.website,
    role: user.role,
    plan: entitlements.planId,
    plan_name: entitlements.plan.name,
    subscription_status: entitlements.status,
    is_paid: entitlements.planId !== "free",
    billing_enabled: entitlements.billingEnabled,
    current_period_end: entitlements.currentPeriodEnd?.toISOString() ?? null,
    limits: entitlements.limits,
    usage: {
      video_minutes: entitlements.usage.videoMinutes,
      queries: entitlements.usage.queries,
      period_start: entitlements.usage.periodStart.toISOString(),
      period_end: entitlements.usage.periodEnd.toISOString(),
    },
    remaining: entitlements.remaining,
  });
}

