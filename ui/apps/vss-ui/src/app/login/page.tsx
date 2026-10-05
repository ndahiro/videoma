"use client";

import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useLogin } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/use-auth";
import { Eye, EyeOff, ArrowRight } from "lucide-react";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const { setToken } = useAuth();

  const loginMutation = useLogin({
    mutation: {
      onSuccess: (data) => {
        setToken(data.access_token);
        // `?next=` is set by requireSession() when a console page bounced the
        // visitor to the sign-in screen.
        const next =
          typeof window !== "undefined"
            ? new URLSearchParams(window.location.search).get("next")
            : null;
        router.push(next && next.startsWith("/") ? next : "/dashboard");
      },
      onError: (err: any) => {
        setError(
          err?.message || "Sign-in failed. Check your credentials and retry."
        );
      },
    },
  });

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    loginMutation.mutate({ data: { username, password } });
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-[1.1fr_1fr] bg-background">
      {/* Editorial left panel */}
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
          <span className="eyebrow">A video intelligence console</span>
          <h1 className="font-serif text-[56px] leading-[0.95] tracking-editorial mt-5">
            Every frame,
            <br />
            <span className="italic text-primary">answerable.</span>
          </h1>
          <p className="mt-6 text-sm text-muted-foreground leading-relaxed max-w-sm">
            Index a library. Ask in plain language. Get back the exact
            moments — with timecodes and citations.
          </p>
        </div>

        <div className="relative flex items-center gap-8">
          <div>
            <div className="font-serif text-2xl tracking-editorial">04</div>
            <div className="eyebrow mt-1">Search modes</div>
          </div>
          <div className="w-px h-8 bg-border" />
          <div>
            <div className="font-serif text-2xl tracking-editorial">∞</div>
            <div className="eyebrow mt-1">Reels indexed</div>
          </div>
          <div className="w-px h-8 bg-border" />
          <div>
            <div className="font-serif text-2xl tracking-editorial">ms</div>
            <div className="eyebrow mt-1">Response time</div>
          </div>
        </div>
      </aside>

      {/* Form right panel */}
      <main className="flex items-center justify-center p-8 lg:p-12">
        <div className="w-full max-w-sm">
          <div className="mb-10">
            <span className="timecode text-[11px] text-primary">SIGN · 01</span>
            <h2 className="font-serif text-3xl tracking-editorial mt-3">
              Welcome back
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Sign in to access your console.
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
                placeholder="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
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
                <span>Password</span>
              </Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
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

            <Button
              type="submit"
              className="w-full group"
              disabled={loginMutation.isPending}
            >
              {loginMutation.isPending ? (
                "Signing in…"
              ) : (
                <>
                  Sign in
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
            No account yet?{" "}
            <Link
              href="/register"
              className="text-primary hover:underline underline-offset-4"
            >
              Create one
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}