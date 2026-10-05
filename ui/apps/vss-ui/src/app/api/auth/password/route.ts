import { NextRequest, NextResponse } from "next/server";
import { db, eq, usersTable } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/auth";
import { requireApiContext } from "@/lib/api-guard";

/**
 * POST /api/auth/password — change the password of the signed-in account.
 * Mirrors CMSaasStarter's "change password" settings pane.
 */
export async function POST(req: NextRequest) {
  const guard = await requireApiContext(req);
  if (!guard.ok) return guard.response;

  try {
    const body = await req.json().catch(() => ({}));
    const { current_password, new_password } = body ?? {};

    if (typeof new_password !== "string" || new_password.length < 4) {
      return NextResponse.json(
        { message: "New password must be at least 4 characters." },
        { status: 400 },
      );
    }

    const [user] = await db
      .select({ passwordHash: usersTable.passwordHash })
      .from(usersTable)
      .where(eq(usersTable.id, guard.value.user.id))
      .limit(1);

    if (!user) {
      return NextResponse.json({ message: "Account not found." }, { status: 404 });
    }

    const valid = await verifyPassword(String(current_password ?? ""), user.passwordHash);
    if (!valid) {
      return NextResponse.json({ message: "Current password is incorrect." }, { status: 401 });
    }

    await db
      .update(usersTable)
      .set({ passwordHash: await hashPassword(new_password), updatedAt: new Date() })
      .where(eq(usersTable.id, guard.value.user.id));

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[password] change failed:", error);
    return NextResponse.json({ message: "Could not change the password." }, { status: 500 });
  }
}
