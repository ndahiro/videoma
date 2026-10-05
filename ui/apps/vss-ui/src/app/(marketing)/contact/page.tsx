import type { Metadata } from "next";
import { SectionHeader } from "@/components/marketing/sections";
import { SupportEmail } from "@/lib/site";
import { ContactForm } from "./contact-form";

export const metadata: Metadata = {
  title: "Contact — Videoma",
  description: "Talk to the team about archives, deployment or a custom plan.",
};

/**
 * Contact page + form. Submissions land in `contact_requests` and trigger a
 * notification email (Resend when configured, logged otherwise).
 */
export default function ContactPage() {
  return (
    <section className="border-b border-border">
      <div className="mx-auto max-w-6xl px-6 py-20 grid gap-14 lg:grid-cols-[0.9fr_1.1fr]">
        <div>
          <SectionHeader
            eyebrow="Contact"
            title="Tell us what you are indexing"
            description="Archive size, camera count, retention window — whatever you know. We answer within one business day."
          />

          <dl className="mt-10 space-y-6 text-sm">
            <div>
              <dt className="eyebrow mb-1">Email</dt>
              <dd>
                <a
                  href={`mailto:${SupportEmail}`}
                  className="text-foreground underline underline-offset-4 hover:no-underline"
                >
                  {SupportEmail}
                </a>
              </dd>
            </div>
            <div>
              <dt className="eyebrow mb-1">Deployments</dt>
              <dd className="text-muted-foreground leading-relaxed">
                Cloud, on-prem or air-gapped: the console and the VSS agent both run from the same
                docker-compose stack.
              </dd>
            </div>
            <div>
              <dt className="eyebrow mb-1">Existing customers</dt>
              <dd className="text-muted-foreground leading-relaxed">
                Billing questions are fastest through the Stripe portal — card, invoices and
                cancellation are all self-serve.
              </dd>
            </div>
          </dl>
        </div>

        <ContactForm />
      </div>
    </section>
  );
}
