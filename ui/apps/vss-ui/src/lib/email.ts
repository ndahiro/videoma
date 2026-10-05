import { WebsiteName } from "@/lib/site";

/**
 * Transactional email — ported from CMSaasStarter's Resend mailer, but reduced
 * to a plain REST call so no extra dependency is needed and the app stays fully
 * functional offline: with no RESEND_API_KEY configured every send is a no-op
 * that is logged instead.
 */

const RESEND_ENDPOINT = "https://api.resend.com/emails";

export function isEmailEnabled(): boolean {
  return Boolean(process.env.RESEND_API_KEY?.trim() && process.env.EMAIL_FROM?.trim());
}

export interface EmailMessage {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
}

export async function sendEmail(message: EmailMessage): Promise<{ sent: boolean; skipped?: string }> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.EMAIL_FROM?.trim();

  if (!apiKey || !from) {
    console.info(
      `[email] skipped "${message.subject}" -> ${Array.isArray(message.to) ? message.to.join(", ") : message.to} (no RESEND_API_KEY/EMAIL_FROM configured)`,
    );
    return { sent: false, skipped: "email_not_configured" };
  }

  const response = await fetch(RESEND_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: Array.isArray(message.to) ? message.to : [message.to],
      subject: message.subject,
      html: message.html,
      text: message.text,
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    console.error("[email] Resend rejected the message:", response.status, detail);
    return { sent: false, skipped: `resend_${response.status}` };
  }

  return { sent: true };
}

export async function sendWelcomeEmail(user: {
  email: string | null;
  username: string;
  planName: string;
}): Promise<void> {
  if (!user.email) return;
  await sendEmail({
    to: user.email,
    subject: `Welcome to ${WebsiteName}`,
    html: `<p>Hi ${user.username},</p>
<p>Your ${WebsiteName} console is ready. You are on the <strong>${user.planName}</strong> plan.</p>
<p>Upload footage, then ask questions in plain language to get back the exact moments with timecodes.</p>
<p>— ${WebsiteName}</p>`,
    text: `Welcome to ${WebsiteName}. You are on the ${user.planName} plan.`,
  });
}

export async function sendContactNotification(request: {
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  companyName?: string | null;
  messageBody?: string | null;
}): Promise<void> {
  const adminEmail = process.env.ADMIN_EMAIL?.trim();
  if (!adminEmail) return;
  const name = [request.firstName, request.lastName].filter(Boolean).join(" ") || "Unknown";
  await sendEmail({
    to: adminEmail,
    subject: `New contact request from ${name}`,
    html: `<p><strong>${name}</strong> (${request.email ?? "no email"}) wrote:</p>
<p>${(request.messageBody ?? "").replace(/</g, "&lt;")}</p>
<p>Company: ${request.companyName ?? "—"}</p>`,
  });
}
