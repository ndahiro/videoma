import { NextRequest, NextResponse } from "next/server";
import { db, eq, stripeEventsTable } from "@/lib/db";
import {
  StripeError,
  stripeRequest,
  verifyStripeSignature,
  webhookSecret,
  type StripeEventEnvelope,
  type StripeSubscription,
} from "@/lib/billing/stripe-rest";
import {
  applySubscription,
  findUserByCustomerId,
  markSubscriptionDeleted,
} from "@/lib/billing/subscriptions";

/**
 * POST /api/billing/webhook
 *
 * Stripe -> app sync. Every event id is recorded in `stripe_events` first, so
 * replayed deliveries are ignored (Stripe retries on anything but a 2xx).
 *
 * Subscribe to these events in the Stripe dashboard:
 *   checkout.session.completed
 *   customer.subscription.created | updated | deleted
 *   invoice.payment_failed
 */
export async function POST(req: NextRequest) {
  const secret = webhookSecret();
  if (!secret) {
    return NextResponse.json(
      { message: "STRIPE_WEBHOOK_SECRET is not configured." },
      { status: 503 },
    );
  }

  const rawBody = await req.text();
  const signature = req.headers.get("stripe-signature");

  const verified = await verifyStripeSignature(rawBody, signature, secret);
  if (!verified) {
    console.warn("[billing/webhook] signature verification failed");
    return NextResponse.json({ message: "Invalid signature." }, { status: 400 });
  }

  let event: StripeEventEnvelope;
  try {
    event = JSON.parse(rawBody) as StripeEventEnvelope;
  } catch {
    return NextResponse.json({ message: "Invalid JSON payload." }, { status: 400 });
  }

  // Idempotency: whoever wins the insert handles the event.
  const inserted = await db
    .insert(stripeEventsTable)
    .values({ id: event.id, type: event.type, payload: event.data?.object ?? null })
    .onConflictDoNothing()
    .returning({ id: stripeEventsTable.id });

  if (inserted.length === 0) {
    return NextResponse.json({ received: true, replayed: true });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const checkoutSession = event.data.object as Record<string, any>;
        const userId =
          checkoutSession.client_reference_id ??
          checkoutSession.metadata?.user_id ??
          null;
        const subscriptionId =
          typeof checkoutSession.subscription === "string"
            ? checkoutSession.subscription
            : checkoutSession.subscription?.id;

        if (subscriptionId && userId) {
          const subscription = await stripeRequest<StripeSubscription>(
            `/subscriptions/${subscriptionId}`,
            {},
            "GET",
          );
          await applySubscription(subscription, userId);
        }
        break;
      }

      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const subscription = event.data.object as unknown as StripeSubscription;
        const customerId =
          typeof subscription.customer === "string" ? subscription.customer : null;
        const userId =
          (event.data.object as Record<string, any>).metadata?.user_id ??
          (customerId ? await findUserByCustomerId(customerId) : null);

        if (userId) {
          await applySubscription(subscription, userId);
        } else {
          console.warn(
            `[billing/webhook] ${event.type}: no local user for customer ${customerId}`,
          );
        }
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as unknown as StripeSubscription;
        const customerId =
          typeof subscription.customer === "string" ? subscription.customer : null;
        const userId = customerId ? await findUserByCustomerId(customerId) : null;
        await markSubscriptionDeleted(subscription.id, userId);
        break;
      }

      case "invoice.payment_failed": {
        // The subscription object carries the authoritative status; the
        // `customer.subscription.updated` event that follows will apply it.
        console.warn(
          `[billing/webhook] payment failed for customer ${(event.data.object as Record<string, any>).customer}`,
        );
        break;
      }

      default:
        // Recorded and acknowledged; nothing to apply.
        break;
    }
  } catch (error) {
    console.error(`[billing/webhook] handler failed for ${event.type}:`, error);
    // Remove the idempotency row so Stripe's retry is processed again.
    await db.delete(stripeEventsTable).where(eq(stripeEventsTable.id, event.id));
    return NextResponse.json(
      {
        message:
          error instanceof StripeError
            ? error.message
            : "Webhook handler failed; Stripe will retry.",
      },
      { status: 500 },
    );
  }

  return NextResponse.json({ received: true });
}
