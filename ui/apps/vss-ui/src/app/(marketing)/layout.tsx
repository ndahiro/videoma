import Link from "next/link";
import type { Metadata } from "next";
import { WebsiteName, WebsiteDescription, SupportEmail } from "@/lib/site";

export const metadata: Metadata = {
  title: `${WebsiteName} — search, question and summarize your video`,
  description: WebsiteDescription,
};

/**
 * Marketing shell — the port of CMSaasStarter's `(marketing)` route group:
 * public, pre-rendered, no session required.
 */
export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b border-border bg-background">
        <div className="mx-auto max-w-6xl px-6 h-16 flex items-center justify-between gap-6">
          <Link href="/" className="flex items-center gap-2.5 shrink-0">
            <div className="relative w-6 h-6">
              <div className="absolute inset-0 border border-primary" />
              <div className="absolute inset-1.5 bg-primary" />
            </div>
            <span className="font-serif text-[17px] tracking-editorial">{WebsiteName}</span>
          </Link>

          <nav className="hidden md:flex items-center gap-8">
            <Link
              href="/#capabilities"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Capabilities
            </Link>
            <Link
              href="/#how"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              How it works
            </Link>
            <Link
              href="/pricing"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Pricing
            </Link>
            <Link
              href="/contact"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Contact
            </Link>
          </nav>

          <div className="flex items-center gap-4 shrink-0">
            <Link
              href="/login"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Sign in
            </Link>
            <Link
              href="/register"
              className="inline-flex h-9 items-center border border-primary px-4 text-sm text-primary hover:bg-primary/10 transition-colors"
            >
              Start free
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="border-t border-border">
        <div className="mx-auto max-w-6xl px-6 py-12 grid gap-10 md:grid-cols-[1.4fr_1fr_1fr]">
          <div>
            <div className="flex items-center gap-2.5 mb-4">
              <div className="relative w-6 h-6">
                <div className="absolute inset-0 border border-primary" />
                <div className="absolute inset-1.5 bg-primary" />
              </div>
              <span className="font-serif text-[17px] tracking-editorial">{WebsiteName}</span>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed max-w-sm">
              {WebsiteDescription}
            </p>
            <p className="mt-4 timecode text-[10px] text-muted-foreground">
              v{process.env.NEXT_PUBLIC_APP_VERSION ?? "1.0.0"} · runs on your own GPU box
            </p>
          </div>

          <div>
            <div className="eyebrow mb-4">Product</div>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>
                <Link href="/pricing" className="hover:text-foreground transition-colors">
                  Pricing
                </Link>
              </li>
              <li>
                <Link href="/#capabilities" className="hover:text-foreground transition-colors">
                  Capabilities
                </Link>
              </li>
              <li>
                <Link href="/contact" className="hover:text-foreground transition-colors">
                  Contact
                </Link>
              </li>
              <li>
                <Link href="/login" className="hover:text-foreground transition-colors">
                  Sign in
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <div className="eyebrow mb-4">Legal</div>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>
                <Link href="/terms" className="hover:text-foreground transition-colors">
                  Terms of service
                </Link>
              </li>
              <li>
                <Link href="/privacy" className="hover:text-foreground transition-colors">
                  Privacy policy
                </Link>
              </li>
              <li>
                <a href={`mailto:${SupportEmail}`} className="hover:text-foreground transition-colors">
                  {SupportEmail}
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="border-t border-border">
          <div className="mx-auto max-w-6xl px-6 py-5 flex items-center justify-between">
            <span className="timecode text-[10px] text-muted-foreground">
              © {new Date().getFullYear()} {WebsiteName}
            </span>
            <span className="timecode text-[10px] text-muted-foreground">
              Stripe · Postgres · NVIDIA VSS
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
