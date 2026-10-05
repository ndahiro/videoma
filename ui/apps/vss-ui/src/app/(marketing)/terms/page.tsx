import type { Metadata } from "next";
import { WebsiteName, SupportEmail } from "@/lib/site";

export const metadata: Metadata = {
  title: "Terms of service — Videoma",
  description: "The terms that govern use of the Videoma console.",
};

/**
 * Terms of service. Kept deliberately plain — swap in counsel-reviewed copy
 * before launch (same caveat CMSaasStarter ships with).
 */
export default function TermsPage() {
  return (
    <section className="border-b border-border">
      <div className="mx-auto max-w-3xl px-6 py-20">
        <span className="eyebrow">Legal</span>
        <h1 className="font-serif text-[40px] leading-[1.05] tracking-editorial mt-4">
          Terms of service
        </h1>
        <p className="mt-4 text-sm text-muted-foreground">
          Last updated {new Date().toLocaleDateString("en-GB", { dateStyle: "long" })}
        </p>

        <div className="mt-12 space-y-9 text-sm leading-relaxed text-muted-foreground">
          <Clause title="1. The service">
            {WebsiteName} is a video intelligence console: you upload or point it at footage, it
            indexes that footage and answers questions about it. The service is provided as-is,
            without warranty of fitness for a particular purpose.
          </Clause>

          <Clause title="2. Your content">
            You keep every right you hold in the footage and any derived text you generate. You
            grant us only the technical licence needed to process, index and store it for you —
            nothing else, and no training of third-party models.
          </Clause>

          <Clause title="3. Plans and metering">
            Paid plans are billed through Stripe on a recurring basis. Usage is metered as video
            minutes indexed and AI calls answered per calendar month. Exceeding an allowance
            pauses the affected action until the next period or an upgrade; it never retroactively
            charges you.
          </Clause>

          <Clause title="4. Cancellations and refunds">
            Subscriptions can be cancelled at any time from the billing portal and stay active
            until the end of the paid period. Partial months are not refunded.
          </Clause>

          <Clause title="5. Acceptable use">
            Do not use the service to process footage you are not entitled to process, and do not
            attempt to bypass plan limits, quotas or authentication.
          </Clause>

          <Clause title="6. Liability">
            To the maximum extent permitted by law our aggregate liability is limited to the fees
            paid in the twelve months preceding the claim.
          </Clause>

          <Clause title="7. Contact">
            Questions about these terms: <a className="text-foreground underline underline-offset-4" href={`mailto:${SupportEmail}`}>{SupportEmail}</a>.
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
