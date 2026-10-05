/**
 * Card payment options for subscriptions.
 *
 * Checkout is handled by Stripe, whose card form auto-detects the brand from
 * the card number. This module gives subscribers an explicit choice up front
 * (Verve, Visa, Mastercard, Amex); the selection is validated here, forwarded
 * to `/api/billing/checkout` as `card_brand`, and stored on the Stripe
 * Checkout Session + subscription metadata for support/debugging.
 *
 * Note: Stripe's card network support varies by account region/currency. Visa,
 * Mastercard and Amex work broadly; Verve (a Nigerian domestic brand) is only
 * accepted where Stripe enables it — if a Verve charge is declined, the
 * customer should use a Visa/Mastercard or pay from the billing portal.
 */

export const CARD_BRANDS = [
  {
    id: "visa",
    label: "Visa",
    hint: "Starts with 4",
  },
  {
    id: "mastercard",
    label: "Mastercard",
    hint: "Starts with 5",
  },
  {
    id: "verve",
    label: "Verve",
    hint: "Starts with 5060–5061, 5078",
  },
  {
    id: "amex",
    label: "Amex",
    hint: "Starts with 34, 37",
  },
] as const;

export type CardBrandId = (typeof CARD_BRANDS)[number]["id"];

export const DEFAULT_CARD_BRAND: CardBrandId = "visa";

export function isCardBrandId(value: unknown): value is CardBrandId {
  return (
    typeof value === "string" &&
    (CARD_BRANDS as readonly { id: string }[]).some((brand) => brand.id === value)
  );
}

export function cardBrandLabel(brandId: string): string {
  const found = (CARD_BRANDS as readonly { id: string; label: string }[]).find(
    (brand) => brand.id === brandId,
  );
  return found ? found.label : brandId;
}

/** Short "Verve · Visa · Mastercard · Amex" string for marketing/billing copy. */
export function acceptedCardsLabel(): string {
  return CARD_BRANDS.map((brand) => brand.label).join(" · ");
}
