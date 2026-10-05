import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";
import { decodeToken, type TokenPayload } from "@/lib/auth";
import { db, eq, usersTable } from "@/lib/db";
import { getEntitlements, type Entitlements } from "@/lib/entitlements";

/**
 * Session handling.
 *
 * The console historically kept its JWT in localStorage (see hooks/use-auth.tsx
 * and the generated api client). That works for browser-side fetches but not
 * for server rendering, so since the SaaS wrapper the token is ALSO written to
 * an httpOnly cookie on login/register. Server components and route handlers
 * read the cookie first and fall back to `Authorization: Bearer <token>` so
 * existing clients keep working unchanged.
 */

export const SESSION_COOKIE = "vss_session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7; // matches the JWT 7d expiry

export interface SessionUser {
  id: string;
  username: string;
  email: string | null;
  fullName: string | null;
  companyName: string | null;
  website: string | null;
  role: string;
  planId: string;
  subscriptionStatus: string;
  currentPeriodEnd: Date | null;
  createdAt: Date;
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  };
}

export async function verifySessionToken(
  token: string | null | undefined,
): Promise<TokenPayload | null> {
  if (!token) return null;
  return decodeToken(token);
}

export function bearerToken(req: NextRequest): string | null {
  const header = req.headers.get("authorization");
  if (header?.startsWith("Bearer ")) return header.slice(7).trim();
  return null;
}

export async function loadSessionUser(userId: string): Promise<SessionUser | null> {
  const [user] = await db
    .select({
      id: usersTable.id,
      username: usersTable.username,
      email: usersTable.email,
      fullName: usersTable.fullName,
      companyName: usersTable.companyName,
      website: usersTable.website,
      role: usersTable.role,
      planId: usersTable.planId,
      subscriptionStatus: usersTable.subscriptionStatus,
      currentPeriodEnd: usersTable.currentPeriodEnd,
      createdAt: usersTable.createdAt,
    })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);

  return user ?? null;
}

export interface Session {
  user: SessionUser;
  entitlements: Entitlements;
}

async function buildSession(payload: TokenPayload | null): Promise<Session | null> {
  if (!payload?.sub) return null;
  const user = await loadSessionUser(payload.sub);
  if (!user) return null;
  const entitlements = await getEntitlements(user.id);
  return { user, entitlements };
}

/** Server-component session (cookie only). */
export async function getSession(): Promise<Session | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value ?? null;
  return buildSession(await verifySessionToken(token));
}

/** Server-component session that redirects to /login when missing. */
export async function requireSession(returnTo?: string): Promise<Session> {
  const session = await getSession();
  if (!session) {
    redirect(returnTo ? `/login?next=${encodeURIComponent(returnTo)}` : "/login");
  }
  return session;
}

/**
 * Route-handler session: httpOnly cookie first, then bearer token.
 * Returns null instead of redirecting so handlers can answer with JSON.
 */
export async function getApiSession(req: NextRequest): Promise<Session | null> {
  const cookieStore = await cookies();
  const cookieToken = cookieStore.get(SESSION_COOKIE)?.value ?? null;
  const token = bearerToken(req) ?? cookieToken;
  return buildSession(await verifySessionToken(token));
}

export function isAdmin(user: Pick<SessionUser, "role"> | null | undefined): boolean {
  return user?.role === "admin";
}
