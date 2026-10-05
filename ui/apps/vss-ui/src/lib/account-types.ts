/**
 * Shape handed to the client shell. Kept in its own module so both the server
 * layout and the sidebar can import it without a circular dependency.
 */
export interface AccountSummary {
  username: string;
  email: string | null;
  role: string;
  planId: string;
  planName: string;
  status: string;
  isPastDue: boolean;
  isTrialing: boolean;
  isCanceled: boolean;
  billingEnabled: boolean;
  currentPeriodEnd: string | null;
  usage: { videoMinutes: number; queries: number };
  limits: { videoMinutesPerMonth: number | null; queriesPerMonth: number | null };
  remaining: { videoMinutes: number | null; queries: number | null };
  percentUsed: { videoMinutes: number; queries: number };
}

export function formatMinutes(minutes: number | null): string {
  if (minutes === null) return "∞";
  if (minutes < 60) return `${minutes}m`;
  const hours = minutes / 60;
  return `${Number.isInteger(hours) ? hours : hours.toFixed(1)}h`;
}
