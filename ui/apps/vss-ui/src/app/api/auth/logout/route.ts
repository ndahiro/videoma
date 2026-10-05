import { NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/session";

/**
 * POST /api/auth/logout
 * Clears the httpOnly session cookie. Clients also drop the localStorage token.
 *
 * Uploaded videos, embeddings and Q&A history are kept: storage lives with
 * the deployment (user's disk), not metered cloud storage, so signing out
 * does not discard the library.
 */
export async function POST() {

  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
  return response;
}
