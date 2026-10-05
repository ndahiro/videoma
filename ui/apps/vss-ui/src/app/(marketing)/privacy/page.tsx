import type { Metadata } from "next";
import { WebsiteName, SupportEmail } from "@/lib/site";

export const metadata: Metadata = {
  title: "Privacy policy — Videoma",
  description: "What Videoma stores, where it lives and how to get it removed.",
};

/**
 * Privacy policy. Describes the data the SaaS wrapper actually touches:
 * account rows, subscription state in Stripe, metered usage counters and
 * contact form submissions.
 */
export default function PrivacyPage() {
  return (
    <section className="border-b border-border">
      <div className="mx-auto max-w-3xl px-6 py-20">
        <span className="eyebrow">Legal</span>
        <h1 className="font-serif text-[40px] leading-[1.05] tracking-editorial mt-4">
          Privacy policy
        </h1>
        <p className="mt-4 text-sm text-muted-foreground">
          Last updated {new Date().toLocaleDateString("en-GB", { dateStyle: "long" })}
        </p>

        <div className="mt-12 space-y-9 text-sm leading-relaxed text-muted-foreground">
          <Clause title="What we store">
            Account data (username, optional email, profile fields), a bcrypt hash of your
            password, subscription state mirrored from Stripe, and counters for the minutes and AI
            calls you consume. Footage and derived indexes live in your own object store.
          </Clause>

          <Clause title="What we do not store">
            We never store card numbers — Stripe handles payment details. We do not sell data, and
            we do not ship your footage to third-party model providers; the VSS agent runs against
            the model endpoints your deployment points at.
          </Clause>

          <Clause title="Processors">
            Payments: Stripe. Email notifications (when configured): Resend. Everything else —
            console, database, agent, models — runs in your own infrastructure.
          </Clause>

          <Clause title="Retention">
            Usage counters are kept per calendar month for billing. Deleting an account removes its
            profile, subscription mirror and usage rows; footage removal is controlled by your own
            storage retention settings.
          </Clause>

          <Clause title="Cookies">
            A single httpOnly session cookie keeps you signed in. No advertising or analytics
            cookies are set.
          </Clause>

          <Clause title="Your rights">
            Request export or deletion of your account data at{" "}
            <a className="text-foreground underline underline-offset-4" href={`mailto:${SupportEmail}`}>
              {SupportEmail}
            </a>
            . Administrators can also remove an account from the {WebsiteName} admin console.
          </Clause>
        </div>
      </div>
    </section>
  );
}

function Clause({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="font-serif text-lg tracking-editorial text-foreground">{title}</h2>
      <p className="mt-2">{children}</p>
    </div>
  );
}
