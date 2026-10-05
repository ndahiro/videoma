/**
 * Minimal Stripe REST client.
 *
 * CMSaasStarter uses the official `stripe` npm package; we deliberately talk to
 * the REST API with `fetch` + form encoding instead, so the offline install
 * (see OFFLINE.md — node_modules are pre-populated) never needs a new
 * dependency and Stripe stays entirely optional.
 */

const STRIPE_API_BASE = "https://api.stripe.com/v1";

export function stripeSecretKey(): string | null {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  return key ? key : null;
}

/** Billing is enabled only when a secret key is configured. */
export function isBillingEnabled(): boolean {
  return stripeSecretKey() !== null;
}

function toFormBody(data: Record<string, unknown>, prefix = ""): string[] {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(data)) {
    if (value === undefined || value === null) continue;
    const field = prefix ? `${prefix}[${key}]` : key;
    if (Array.isArray(value)) {
      value.forEach((entry, index) => {
        if (entry !== null && typeof entry === "object") {
          parts.push(...toFormBody(entry as Record<string, unknown>, `${field}[${index}]`));
        } else {
          parts.push(
            `${encodeURIComponent(`${field}[${index}]`)}=${encodeURIComponent(String(entry))}`,
          );
        }
      });
    } else if (typeof value === "object") {
      parts.push(...toFormBody(value as Record<string, unknown>, field));
    } else {
      parts.push(`${encodeURIComponent(field)}=${encodeURIComponent(String(value))}`);
    }
  }
  return parts;
}

export class StripeError extends Error {
  status: number;
  constructor(message: string, status = 500) {
    super(message);
    this.name = "StripeError";
    this.status = status;
  }
}

export async function stripeRequest<T = any>(
  path: string,
  params: Record<string, unknown> = {},
  method: "GET" | "POST" | "DELETE" = "POST",
): Promise<T> {
  const key = stripeSecretKey();
  if (!key) {
    throw new StripeError("Stripe is not configured (STRIPE_SECRET_KEY missing).", 503);
  }

  const url =
    method === "GET" && Object.keys(params).length > 0
      ? `${STRIPE_API_BASE}${path}?${toFormBody(params).join("&")}`
      : `${STRIPE_API_BASE}${path}`;

  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: method === "GET" ? undefined : toFormBody(params).join("&"),
    cache: "no-store",
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      (payload as any)?.error?.message ||
      `Stripe request failed (${response.status} ${response.statusText})`;
    throw new StripeError(message, response.status);
  }
  return payload as T;
}

// ---------------------------------------------------------------------------
// Webhook signature verification (HMAC-SHA256, Stripe's v1 scheme)
// ---------------------------------------------------------------------------

export interface StripeEventEnvelope {
  id: string;
  type: string;
  data: { object: Record<string, any> };
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

export async function verifyStripeSignature(
  rawBody: string,
  signatureHeader: string | null,
  secret: string,
  toleranceSeconds = 300,
): Promise<boolean> {
  if (!signatureHeader) return false;

  const parts = signatureHeader.split(",").reduce<Record<string, string>>((acc, part) => {
    const [key, value] = part.split("=");
    if (key && value) acc[key.trim()] = value.trim();
    return acc;
  }, {});

  const timestamp = parts["t"];
  const expected = parts["v1"];
  if (!timestamp || !expected) return false;

  const { createHmac } = await import("node:crypto");
  const signedPayload = `${timestamp}.${rawBody}`;
  const digest = createHmac("sha256", secret).update(signedPayload, "utf8").digest("hex");

  if (!timingSafeEqual(digest, expected)) return false;

  const age = Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp));
  return Number.isFinite(age) && age <= toleranceSeconds;
}

export function webhookSecret(): string | null {
  const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  return secret ? secret : null;
}

// ---------------------------------------------------------------------------
// Typed-ish helpers used by the billing routes
// ---------------------------------------------------------------------------

export interface StripeSubscription {
  id: string;
  customer: string;
  status: string;
  cancel_at_period_end?: boolean;
  /** Present on older API versions; newer versions put it on the item. */
  current_period_end?: number;
  items?: {
    data?: Array<{
      current_period_end?: number;
      price?: { id?: string; product?: string };
    }>;
  };
}

export function subscriptionPriceIds(subscription: StripeSubscription): {
  priceId: string | null;
  productId: string | null;
} {
  const item = subscription.items?.data?.[0];
  return {
    priceId: item?.price?.id ?? null,
    productId:
      typeof item?.price?.product === "string" ? item.price.product : null,
  };
}
