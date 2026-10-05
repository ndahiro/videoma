import { NextResponse } from "next/server";

/**
 * GET /api/healthz — public liveness probe (no agent call, no auth).
 */
export async function GET() {
  return NextResponse.json({
    status: "ok",
    service: process.env.NEXT_PUBLIC_APP_NAME || "videoma",
    version: process.env.NEXT_PUBLIC_APP_VERSION || "1.0.0",
    time: new Date().toISOString(),
  });
}
