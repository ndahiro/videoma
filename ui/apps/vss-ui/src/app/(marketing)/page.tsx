import Link from "next/link";
import { FeatureCard, PlanCard, SectionHeader, Step } from "@/components/marketing/sections";
import { pricingPlans } from "@/lib/plans";
import { planPriceMap } from "@/lib/billing/prices";

/**
 * Landing page (`/`) — the marketing front door that replaced the old
 * `/` -> `/dashboard` redirect. Server-rendered, no session required.
 */
export default function LandingPage() {
  const configuredPrices = planPriceMap();

  return (
    <div>
      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section className="relative border-b border-border overflow-hidden">
        <div className="absolute inset-0 perf opacity-[0.05] pointer-events-none" />
        <div className="relative mx-auto max-w-6xl px-6 py-20 lg:py-28 grid gap-16 lg:grid-cols-[1.1fr_0.9fr] items-center">
          <div>
            <div className="flex items-center gap-3 mb-6">
              <span className="rec-dot" />
              <span className="eyebrow">A video intelligence console</span>
            </div>

            <h1 className="font-serif text-[54px] lg:text-[64px] leading-[0.95] tracking-editorial">
              Every frame,
              <br />
              <span className="italic text-primary">answerable.</span>
            </h1>

            <p className="mt-7 text-base text-muted-foreground leading-relaxed max-w-lg">
              Index a library. Ask in plain language. Get back the exact moments — with timecodes,
              citations and reports you can hand to someone else.
            </p>

            <div className="mt-9 flex flex-wrap items-center gap-3">
              <Link
                href="/register"
                className="inline-flex h-12 items-center bg-primary px-6 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                Start free — 30 minutes indexed
              </Link>
              <Link
                href="/pricing"
                className="inline-flex h-12 items-center border border-border px-6 text-sm text-foreground hover:border-foreground/30 transition-colors"
              >
                See pricing
              </Link>
            </div>

            <div className="mt-12 flex flex-wrap items-center gap-x-8 gap-y-4">
              <Metric value="4" label="Search modes" />
              <span className="w-px h-8 bg-border hidden sm:block" />
              <Metric value="∞" label="Reels indexed" />
              <span className="w-px h-8 bg-border hidden sm:block" />
              <Metric value="ms" label="Retrieval" />
            </div>
          </div>

          <HeroPanel />
        </div>
      </section>

      {/* ── Capabilities ─────────────────────────────────────────────────── */}
      <section id="capabilities" className="border-b border-border">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <SectionHeader
            eyebrow="Capabilities"
            title="One console, four ways in"
            description="Videoma wraps the NVIDIA VSS agent — vision-language understanding, embedding search and report generation — in a workspace your team can actually use."
          />

          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            <FeatureCard
              index="01"
              title="Reel library"
              body="Ingest from uploads or a server-side folder. Watch jobs move from queued to indexed without leaving the page."
            />
            <FeatureCard
              index="02"
              title="Semantic search"
              body="Describe what you are looking for. Results come back as scored moments with timestamps, not file names."
            />
            <FeatureCard
              index="03"
              title="Q & A with citations"
              body="Ask a question in plain language and get an answer anchored to the frames it came from."
            />
            <FeatureCard
              index="04"
              title="Summaries & reports"
              body="Brief, detailed or bullet-point summaries per reel, exportable to PDF and Word for briefings."
            />
          </div>
        </div>
      </section>


      {/* ── How it works ─────────────────────────────────────────────────── */}
      <section id="how" className="border-b border-border bg-card/40">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <SectionHeader
            eyebrow="How it works"
            title="Three moves from footage to answer"
            description="Nothing is shipped to a third party: the models run on your own GPU server, and only the console and its database need a network."
          />

          <div className="mt-12 grid gap-8 md:grid-cols-3">
            <Step
              index="01"
              title="Ingest"
              body="Upload clips or point the agent at a folder. The pipeline embeds every scene and indexes transcripts."
            />
            <Step
              index="02"
              title="Ask"
              body="Search, question or summarize. Every answer cites the exact seconds it used so it can be checked."
            />
            <Step
              index="03"
              title="Share"
              body="Export a report or hand over a link. Plans meter indexing minutes and AI calls — nothing else."
            />
          </div>
        </div>
      </section>

      {/* ── Pricing teaser ───────────────────────────────────────────────── */}
      <section className="border-b border-border">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <SectionHeader
              eyebrow="Pricing"
              title="Straightforward plans"
              description="Metered on the two things that cost real money upstream: video minutes indexed and AI calls answered."
            />
            <Link
              href="/pricing"
              className="text-sm text-primary underline underline-offset-4 hover:no-underline"
            >
              Full comparison
            </Link>
          </div>

          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {pricingPlans.map((plan) => (
              <PlanCard
                key={plan.id}
                plan={plan}
                configured={plan.id === "free" || Boolean(configuredPrices[plan.id])}
              />
            ))}
          </div>
        </div>
      </section>

      {/* ── Closing CTA ──────────────────────────────────────────────────── */}
      <section>
        <div className="mx-auto max-w-6xl px-6 py-20">
          <div className="border border-primary/40 bg-primary/5 p-10 lg:p-14">
            <div className="eyebrow mb-4">Ready when you are</div>
            <h2 className="font-serif text-[36px] leading-[1.1] tracking-editorial max-w-2xl">
              Start on the free plan. Bring your own archive.
            </h2>
            <p className="mt-4 text-sm text-muted-foreground max-w-xl leading-relaxed">
              The free tier indexes 30 minutes a month and answers 50 questions — enough to prove
              the pipeline on real footage before you pay for anything.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/register"
                className="inline-flex h-12 items-center bg-primary px-6 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                Create an account
              </Link>
              <Link
                href="/contact"
                className="inline-flex h-12 items-center border border-border px-6 text-sm text-foreground hover:border-foreground/30 transition-colors"
              >
                Talk to us
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function Metric({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <div className="font-serif text-2xl tracking-editorial">{value}</div>
      <div className="eyebrow mt-1">{label}</div>
    </div>
  );
}

/** Static console mock — pure markup, keeps the landing page free of client JS. */
function HeroPanel() {
  return (
    <div className="border border-card-border bg-card">
      <div className="flex items-center justify-between px-5 py-3 border-b border-border">
        <span className="eyebrow">Live library</span>
        <span className="timecode text-[10px] text-muted-foreground">00:12:04:18</span>
      </div>

      <div className="grid grid-cols-3 divide-x divide-border border-b border-border">
        <PanelKpi label="Reels" value="128" />
        <PanelKpi label="Indexed" value="42h" />
        <PanelKpi label="Jobs" value="03" tone="warn" />
      </div>

      <div className="p-5 space-y-4">
        <div className="border border-border p-3">
          <div className="eyebrow mb-2">Query</div>
          <div className="text-sm text-foreground">
            “When did the blue van enter the yard?”
          </div>
        </div>

        {[
          { t: "00:04:12 → 00:04:19", d: "Blue van enters through the north gate", s: "0.94" },
          { t: "00:11:47 → 00:11:53", d: "Same van reverses toward the loading bay", s: "0.88" },
          { t: "00:19:02 → 00:19:07", d: "Van parked beside the container stack", s: "0.81" },
        ].map((hit) => (
          <div key={hit.t} className="border-l border-primary/60 pl-4">
            <div className="flex items-center justify-between gap-4">
              <span className="timecode text-[10px] text-primary">{hit.t}</span>
              <span className="timecode text-[10px] text-muted-foreground">score {hit.s}</span>
            </div>
            <div className="text-xs text-muted-foreground mt-1">{hit.d}</div>
          </div>
        ))}

        <div className="tape-bar" />
      </div>
    </div>
  );
}

function PanelKpi({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "warn";
}) {
  return (
    <div className="px-5 py-4">
      <div className="eyebrow mb-2">{label}</div>
      <div
        className={`font-serif text-2xl tracking-editorial ${tone === "warn" ? "text-warn" : ""}`}
      >
        {value}
      </div>
    </div>
  );
}

