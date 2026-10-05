import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/session";
import { isBillingEnabled, StripeError, stripeRequest } from "@/lib/billing/stripe-rest";
import { priceIdForPlan } from "@/lib/billing/prices";
import { DEFAULT_CARD_BRAND, isCardBrandId } from "@/lib/billing/payment-methods";
import { getOrCreateCustomerId } from "@/lib/billing/subscriptions";

/**
 * POST /api/billing/checkout  { plan: "pro" | "scale", card_brand?: "visa" | "mastercard" | "verve" | "amex" }
 *
 * Creates a Stripe Checkout session and returns its URL. This is the port of
 * CMSaasStarter's `/account/subscribe/[price_id]` server load, turned into a
 * JSON endpoint so the console can call it from the pricing page, the
 * onboarding step and the billing page.
 *
 * `card_brand` is the subscriber's chosen card network. Stripe's card form
 * auto-detects the brand from the number; the choice is recorded on the
 * session + subscription metadata and card payments are explicitly enabled.
 */
export async function POST(req: NextRequest) {
  const session = await getApiSession(req);
  if (!session) {
    return NextResponse.json({ message: "Sign in to subscribe." }, { status: 401 });
  }

  if (!isBillingEnabled()) {
    return NextResponse.json(
      {
        message:
          "Billing is not configured on this deployment (STRIPE_SECRET_KEY missing). Plan changes can be made by an administrator.",
        code: "billing_disabled",
      },
      { status: 503 },
    );
  }

  try {
    const body = await req.json().catch(() => ({}));
    const planId = typeof body?.plan === "string" ? body.plan : "";
    const priceId = priceIdForPlan(planId);
    const cardBrand = isCardBrandId(body?.card_brand) ? body.card_brand : DEFAULT_CARD_BRAND;

    if (!priceId) {
      return NextResponse.json(
        { message: `No Stripe price is configured for the "${planId || "unknown"}" plan.` },
        { status: 400 },
      );
    }

    const { user } = session;
    const customerId = await getOrCreateCustomerId(user);
    const origin =
      req.headers.get("origin") ?? process.env.NEXT_PUBLIC_SITE_URL ?? req.nextUrl.origin;

    const checkout = await stripeRequest<{ id: string; url: string | null }>(
      "/checkout/sessions",
      {
        mode: "subscription",
        customer: customerId,
        line_items: [{ price: priceId, quantity: 1 }],
        // Explicitly enable card payments (Verve, Visa, Mastercard, Amex —
        // subject to Stripe's per-region network support).
        payment_method_types: ["card"],
        success_url: `${origin}/account/billing?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${origin}/account/billing?checkout=cancelled`,
        client_reference_id: user.id,
        allow_promotion_codes: true,
        subscription_data: { metadata: { user_id: user.id, plan_id: planId, card_brand: cardBrand } },
        metadata: { user_id: user.id, plan_id: planId, card_brand: cardBrand },
      },
    );

    if (!checkout?.url) {
      return NextResponse.json(
        { message: "Stripe did not return a checkout URL." },
        { status: 502 },
      );
    }

    return NextResponse.json({ url: checkout.url, plan: planId, card_brand: cardBrand });
  } catch (error) {
    const status = error instanceof StripeError ? error.status : 500;
    console.error("[billing/checkout] failed:", error);
    return NextResponse.json(
      {
        message:
          error instanceof StripeError
            ? error.message
            : "Could not start the checkout. Please try again.",
      },
      { status: status >= 400 && status < 600 ? status : 500 },
    );
  }
}
