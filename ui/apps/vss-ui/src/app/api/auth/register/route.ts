import { NextRequest, NextResponse } from "next/server";
import { db, usersTable, eq } from "@/lib/db";
import { hashPassword, signToken } from "@/lib/auth";
import { SESSION_COOKIE, sessionCookieOptions } from "@/lib/session";
import { sendWelcomeEmail } from "@/lib/email";
import { getPlan, selectablePlanIds, type PlanId } from "@/lib/plans";
import { priceIdForPlan } from "@/lib/billing/prices";

/**
 * POST /api/auth/register
 *
 * Creates the account, starts it on the requested plan (free by default) and
 * returns a JWT *and* an httpOnly session cookie. Mirrors CMSaasStarter's
 * sign-up + create_profile flow, minus the email-confirmation round trip.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { username, password, email, full_name, company_name, website } = body ?? {};

    if (!username || typeof username !== "string" || username.trim().length < 3) {
      return NextResponse.json(
        { message: "Username must be at least 3 characters." },
        { status: 400 },
      );
    }
    if (!password || typeof password !== "string" || password.length < 4) {
      return NextResponse.json(
        { message: "Password must be at least 4 characters." },
        { status: 400 },
      );
    }
    if (email && (typeof email !== "string" || !email.includes("@"))) {
      return NextResponse.json({ message: "Enter a valid email address." }, { status: 400 });
    }

    const cleanUsername = username.trim();
    const requestedPlan = typeof body?.plan === "string" ? body.plan : "free";
    const planId: PlanId = selectablePlanIds().includes(requestedPlan as PlanId)
      ? (requestedPlan as PlanId)
      : "free";

    const existing = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.username, cleanUsername))
      .limit(1);

    if (existing.length > 0) {
      return NextResponse.json({ message: "Username already taken." }, { status: 409 });
    }

    const passwordHash = await hashPassword(password);
    const [user] = await db
      .insert(usersTable)
      .values({
        username: cleanUsername,
        email: email ? String(email).trim() : null,
        passwordHash,
        fullName: typeof full_name === "string" ? full_name.trim() : null,
        companyName: typeof company_name === "string" ? company_name.trim() : null,
        website: typeof website === "string" ? website.trim() : null,
        planId: "free",
        subscriptionStatus: "free",
      })
      .returning({
        id: usersTable.id,
        username: usersTable.username,
        role: usersTable.role,
        email: usersTable.email,
      });

    const access_token = await signToken({
      sub: user.id,
      username: user.username,
      role: user.role,
    });

    const checkoutPriceId = priceIdForPlan(planId);
    await sendWelcomeEmail({
      email: user.email,
      username: user.username,
      planName: getPlan(planId).name,
    });

    const response = NextResponse.json({
      access_token,
      token_type: "bearer",
      username: user.username,
      plan: planId,
      // Present when the caller asked for a paid plan: the client sends the
      // user straight to Stripe Checkout.
      checkout_plan: checkoutPriceId ? planId : null,
    });
    response.cookies.set(SESSION_COOKIE, access_token, sessionCookieOptions());
    return response;
  } catch (error) {
    console.error("Register error:", error);
    const message = (error as { code?: string })?.code === "23505"
      ? "Username or email already registered."
      : "Internal server error.";
    return NextResponse.json({ message }, { status: 500 });
  }
}

