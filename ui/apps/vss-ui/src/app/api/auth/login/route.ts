import { NextRequest, NextResponse } from "next/server";
import { db, usersTable, eq } from "@/lib/db";
import { verifyPassword, signToken } from "@/lib/auth";
import { SESSION_COOKIE, sessionCookieOptions } from "@/lib/session";
import { applyRateLimit } from "@/lib/rate-limit";

/**
 * POST /api/auth/login
 *
 * Authenticates a user and returns a JWT token plus the httpOnly session cookie
 * that server components use for gating (see src/lib/session.ts).
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { username, password } = body;

    if (!username || !password) {
      return NextResponse.json(
        { message: "Username and password are required." },
        { status: 400 },
      );
    }

    // Brute-force guard (keyed by username: no identity exists pre-auth).
    const limited = await applyRateLimit(`login:${String(username).trim().toLowerCase()}`, true);
    if (limited) return limited;

    // Find user
    const [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.username, username.trim()))
      .limit(1);

    if (!user) {
      return NextResponse.json(
        { message: "Invalid username or password." },
        { status: 401 },
      );
    }

    // Verify password
    const valid = await verifyPassword(password, user.passwordHash);
    if (!valid) {
      return NextResponse.json(
        { message: "Invalid username or password." },
        { status: 401 },
      );
    }

    // Sign JWT
    const access_token = await signToken({
      sub: user.id,
      username: user.username,
      role: user.role,
    });

    await db
      .update(usersTable)
      .set({ lastLoginAt: new Date() })
      .where(eq(usersTable.id, user.id));

    const response = NextResponse.json({
      access_token,
      token_type: "bearer",
      username: user.username,
      plan: user.planId,
    });
    response.cookies.set(SESSION_COOKIE, access_token, sessionCookieOptions());
    return response;
  } catch (error) {
    console.error("Login error:", error);
    return NextResponse.json(
      { message: "Internal server error." },
      { status: 500 },
    );
  }
}

