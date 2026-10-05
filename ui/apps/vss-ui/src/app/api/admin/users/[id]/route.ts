import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-guard";
import { db, eq, usersTable } from "@/lib/db";
import { invalidateEntitlements } from "@/lib/entitlements";
import { pricingPlans, type PlanId } from "@/lib/plans";

/**
 * PATCH /api/admin/users/{id}
 *
 * Comp an account onto a plan (or back to free), grant admin rights, or suspend
 * access — the escape hatch that keeps the product usable when Stripe is not
 * configured.
 *
 *   { "plan": "pro" | "scale" | "free", "role": "admin" | "user", "status": "active" }
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireAdmin(req);
  if (!guard.ok) return guard.response;

  const { id } = await params;

  try {
    const body = await req.json().catch(() => ({}));
    const updates: Record<string, unknown> = { updatedAt: new Date() };

    if (body?.plan !== undefined) {
      const planId = String(body.plan) as PlanId;
      if (!pricingPlans.some((plan) => plan.id === planId)) {
        return NextResponse.json({ message: `Unknown plan "${body.plan}".` }, { status: 400 });
      }
      updates.planId = planId;
      // Admin-granted plans are recorded as manually active so gating passes.
      updates.subscriptionStatus = planId === "free" ? "free" : "active";
    }

    if (body?.role !== undefined) {
      if (!["admin", "user"].includes(String(body.role))) {
        return NextResponse.json({ message: "role must be admin or user." }, { status: 400 });
      }
      updates.role = String(body.role);
    }

    if (body?.status !== undefined) {
      updates.subscriptionStatus = String(body.status);
    }

    if (Object.keys(updates).length === 1) {
      return NextResponse.json({ message: "Nothing to update." }, { status: 400 });
    }

    const [user] = await db
      .update(usersTable)
      .set(updates)
      .where(eq(usersTable.id, id))
      .returning({
        id: usersTable.id,
        username: usersTable.username,
        planId: usersTable.planId,
        subscriptionStatus: usersTable.subscriptionStatus,
        role: usersTable.role,
      });

    if (!user) {
      return NextResponse.json({ message: "Account not found." }, { status: 404 });
    }

    invalidateEntitlements(id);

    return NextResponse.json({ ok: true, user });
  } catch (error) {
    console.error("[admin/users] update failed:", error);
    return NextResponse.json({ message: "Could not update the account." }, { status: 500 });
  }
}
