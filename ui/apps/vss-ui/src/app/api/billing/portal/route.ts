import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/session";
import { isBillingEnabled, StripeError, stripeRequest } from "@/lib/billing/stripe-rest";
import { getOrCreateCustomerId } from "@/lib/billing/subscriptions";

/**
 * POST /api/billing/portal
 *
 * Opens the Stripe billing portal (change card, upgrade, cancel, receipts).
 * Port of CMSaasStarter's `/account/billing/manage` route.
 */
export async function POST(req: NextRequest) {
  const session = await getApiSession(req);
  if (!session) {
    return NextResponse.json({ message: "Sign in to manage billing." }, { status: 401 });
  }

  if (!isBillingEnabled()) {
    return NextResponse.json(
      {
        message:
          "Billing is not configured on this deployment, so there is no Stripe portal to open.",
        code: "billing_disabled",
      },
      { status: 503 },
    );
  }

  try {
    const { user } = session;
    const customerId = await getOrCreateCustomerId(user);
    const origin =
      req.headers.get("origin") ?? process.env.NEXT_PUBLIC_SITE_URL ?? req.nextUrl.origin;

    const portal = await stripeRequest<{ url: string | null }>("/billing_portal/sessions", {
      customer: customerId,
      return_url: `${origin}/account/billing`,
    });

    if (!portal?.url) {
      return NextResponse.json(
        { message: "Stripe did not return a portal URL." },
        { status: 502 },
      );
    }

    return NextResponse.json({ url: portal.url });
  } catch (error) {
    const status = error instanceof StripeError ? error.status : 500;
    console.error("[billing/portal] failed:", error);
    return NextResponse.json(
      {
        message:
          error instanceof StripeError
            ? error.message
            : "Could not open the billing portal. Please try again.",
      },
      { status: status >= 400 && status < 600 ? status : 500 },
    );
  }
}
