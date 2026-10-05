"use client";

import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/use-auth";
import { Eye, EyeOff, ArrowRight } from "lucide-react";

export default function RegisterPage() {
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const { setToken } = useAuth();

  // `/register?plan=pro` comes from the pricing page; it only pre-selects a
  // plan — payment happens in the onboarding step (or the billing page).
  const requestedPlan =
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("plan") ?? "free"
      : "free";

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username,
          password,
          email: email || undefined,
          plan: requestedPlan,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.message || "Registration failed.");
        return;
      }

      setToken(data.access_token);
      // Onboarding picks the plan (and starts Stripe Checkout when one is chosen).
      router.push(`/onboarding?plan=${data.plan ?? requestedPlan}`);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-[1.1fr_1fr] bg-background">
      <aside className="relative hidden lg:flex flex-col justify-between p-12 border-r border-border bg-card overflow-hidden">
        <div className="absolute inset-0 perf opacity-[0.07] pointer-events-none" />

        <div className="relative">
          <div className="flex items-center gap-2.5">
            <div className="relative w-7 h-7">
              <div className="absolute inset-0 border border-primary" />
              <div className="absolute inset-1.5 bg-primary" />
            </div>
            <span className="font-serif text-lg tracking-editorial">
              Videoma
            </span>
          </div>
        </div>

        <div className="relative max-w-md">
          <span className="eyebrow">New account</span>
          <h1 className="font-serif text-[56px] leading-[0.95] tracking-editorial mt-5">
            A console
            <br />
            <span className="italic text-primary">for your reels.</span>
          </h1>
          <p className="mt-6 text-sm text-muted-foreground leading-relaxed max-w-sm">
            Create an account to start indexing videos and asking questions
            across them.
          </p>
        </div>

        <div className="relative timecode text-[10px] text-muted-foreground uppercase tracking-[0.18em]">
          Onboarding · Three steps
        </div>
      </aside>

      <main className="flex items-center justify-center p-8 lg:p-12">
        <div className="w-full max-w-sm">
          <div className="mb-10">
            <span className="timecode text-[11px] text-primary">SIGN · 02</span>
            <h2 className="font-serif text-3xl tracking-editorial mt-3">
              Create account
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Takes about thirty seconds.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <div className="border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                {error}
              </div>
            )}

            <div className="space-y-2">
              <Label
                htmlFor="username"
                className="eyebrow flex items-center gap-2"
              >
                <span>01</span>
                <span>Username</span>
              </Label>
              <Input
                id="username"
                placeholder="min 3 chars"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                minLength={3}
                autoComplete="username"
                autoFocus
                className="font-mono"
              />
            </div>

            <div className="space-y-2">
              <Label
                htmlFor="password"
                className="eyebrow flex items-center gap-2"
              >
                <span>02</span>
                <span>Email</span>
                <span className="text-muted-foreground/60 normal-case tracking-normal">
                  optional — used for receipts
                </span>
              </Label>
              <Input
                id="email"
                type="email"
                placeholder="you@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                className="font-mono"
              />
            </div>

            <div className="space-y-2">
              <Label
                htmlFor="password"
                className="eyebrow flex items-center gap-2"
              >
                <span>03</span>
                <span>Password</span>
              </Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="min 4 chars"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={4}
                  autoComplete="new-password"
                  className="pr-10 font-mono"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  tabIndex={-1}
                  aria-label="Toggle password visibility"
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" strokeWidth={1.75} />
                  ) : (
                    <Eye className="h-4 w-4" strokeWidth={1.75} />
                  )}
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <Label
                htmlFor="confirmPassword"
                className="eyebrow flex items-center gap-2"
              >
                <span>04</span>
                <span>Confirm</span>
              </Label>
              <Input
                id="confirmPassword"
                type={showPassword ? "text" : "password"}
                placeholder="repeat"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={4}
                autoComplete="new-password"
                className="font-mono"
              />
            </div>

            <Button
              type="submit"
              className="w-full group"
              disabled={loading}
            >
              {loading ? (
                "Creating account…"
              ) : (
                <>
                  Create account
                  <ArrowRight
                    className="w-4 h-4 group-hover:translate-x-0.5 transition-transform"
                    strokeWidth={2}
                  />
                </>
              )}
            </Button>
          </form>

          <div className="hr-hairline my-8" />

          <p className="text-xs text-muted-foreground">
            Already have an account?{" "}
            <Link
              href="/login"
              className="text-primary hover:underline underline-offset-4"
            >
              Sign in
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}