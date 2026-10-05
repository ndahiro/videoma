import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-guard";
import { listAccounts } from "@/lib/admin";

/**
 * GET /api/admin/users
 *
 * Admin console data: every account with its plan, subscription state and the
 * metered usage for the current month. Mirrors CMSaasStarter's admin user list
 * (which lives in the account area there).
 */
export async function GET(req: NextRequest) {
  const guard = await requireAdmin(req);
  if (!guard.ok) return guard.response;

  try {
    const { accounts, period } = await listAccounts({
      search: req.nextUrl.searchParams.get("search")?.trim() ?? undefined,
      plan: req.nextUrl.searchParams.get("plan")?.trim() ?? undefined,
      limit: Number(req.nextUrl.searchParams.get("limit") ?? 100) || 100,
    });

    return NextResponse.json({
      period: { start: period.start.toISOString(), end: period.end.toISOString() },
      users: accounts,
    });
  } catch (error) {
    console.error("[admin/users] listing failed:", error);
    return NextResponse.json({ message: "Could not load accounts." }, { status: 500 });
  }
}
