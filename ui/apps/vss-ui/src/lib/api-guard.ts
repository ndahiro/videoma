import { NextResponse, type NextRequest } from "next/server";
import { getApiSession, type Session } from "@/lib/session";
import { checkQuota } from "@/lib/entitlements";
import type { UsageKind } from "@/lib/usage";
import type { PlanId } from "@/lib/plans";

/**
 * Route-handler guards. Every billable endpoint goes through `requireApiContext`
 * (identity) and `requireQuota` (plan limits), so the SaaS rules live in one
 * place instead of being repeated in each proxy route.
 */

export type GuardResult<T> = { ok: true; value: T } | { ok: false; response: NextResponse };

export function unauthorized(message = "Sign in to continue."): NextResponse {
  return NextResponse.json({ message }, { status: 401 });
}

export function forbidden(message: string, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ message, ...extra }, { status: 403 });
}

export function paymentRequired(
  message: string,
  extra: Record<string, unknown> = {},
): NextResponse {
  return NextResponse.json({ message, ...extra }, { status: 402 });
}

export async function requireApiContext(req: NextRequest): Promise<GuardResult<Session>> {
  const session = await getApiSession(req);
  if (!session) return { ok: false, response: unauthorized() };
  return { ok: true, value: session };
}

export async function requireAdmin(req: NextRequest): Promise<GuardResult<Session>> {
  const guard = await requireApiContext(req);
  if (!guard.ok) return guard;
  if (guard.value.user.role !== "admin") {
    return { ok: false, response: forbidden("Administrator access required.") };
  }
  return guard;
}

/**
 * Quota gate for one billable action. Returns the full session (user +
 * entitlements) so the route can record usage after a successful upstream call.
 */
export async function requireQuota(
  req: NextRequest,
  kind: UsageKind,
  options: { requestedMinutes?: number; libraryMinutes?: number } = {},
): Promise<GuardResult<Session>> {
  const guard = await requireApiContext(req);
  if (!guard.ok) return guard;

  const { entitlements } = guard.value;
  const decision = checkQuota(entitlements, kind, options);

  if (!decision.allowed) {
    return {
      ok: false,
      response: paymentRequired(decision.message ?? "Plan limit reached.", {
        code: decision.reason,
        plan: entitlements.planId,
        upgrade_to: decision.upgradeTo ?? ("pro" satisfies PlanId),
        usage: {
          video_minutes: entitlements.usage.videoMinutes,
          queries: entitlements.usage.queries,
        },
        limits: {
          video_minutes_per_month: entitlements.limits.videoMinutesPerMonth,
          queries_per_month: entitlements.limits.queriesPerMonth,
        },
      }),
    };
  }

  return { ok: true, value: guard.value };
}

/** Parses `duration_seconds` / multipart hints into whole minutes (rounded up). */
export function minutesFromSeconds(seconds: number | null | undefined): number {
  if (!seconds || !Number.isFinite(seconds) || seconds <= 0) return 1;
  return Math.max(1, Math.ceil(seconds / 60));
}
