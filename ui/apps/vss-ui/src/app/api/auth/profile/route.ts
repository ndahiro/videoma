import { NextRequest, NextResponse } from "next/server";
import { db, eq, usersTable } from "@/lib/db";
import { requireApiContext } from "@/lib/api-guard";

/**
 * PATCH /api/auth/profile — update the profile fields from the account page
 * (full name, company, website, email, marketing opt-out).
 */
export async function PATCH(req: NextRequest) {
  const guard = await requireApiContext(req);
  if (!guard.ok) return guard.response;

  try {
    const body = await req.json().catch(() => ({}));
    const updates: Record<string, unknown> = { updatedAt: new Date() };

    for (const [field, column] of [
      ["full_name", "fullName"],
      ["company_name", "companyName"],
      ["website", "website"],
      ["email", "email"],
    ] as const) {
      const value = body?.[field];
      if (value === undefined) continue;
      if (typeof value !== "string") {
        return NextResponse.json({ message: `${field} must be a string.` }, { status: 400 });
      }
      updates[column] = value.trim() === "" ? null : value.trim();
    }

    if (typeof body?.unsubscribed === "boolean") {
      updates.unsubscribed = body.unsubscribed;
    }

    if (Object.keys(updates).length === 1) {
      return NextResponse.json({ message: "Nothing to update." }, { status: 400 });
    }

    const [user] = await db
      .update(usersTable)
      .set(updates)
      .where(eq(usersTable.id, guard.value.user.id))
      .returning({
        id: usersTable.id,
        username: usersTable.username,
        email: usersTable.email,
        fullName: usersTable.fullName,
        companyName: usersTable.companyName,
        website: usersTable.website,
        unsubscribed: usersTable.unsubscribed,
      });

    return NextResponse.json({ ok: true, user });
  } catch (error) {
    console.error("[profile] update failed:", error);
    const code = (error as { code?: string })?.code;
    if (code === "23505") {
      return NextResponse.json(
        { message: "That email address is already in use." },
        { status: 409 },
      );
    }
    return NextResponse.json({ message: "Could not update the profile." }, { status: 500 });
  }
}
