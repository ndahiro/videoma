"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Film,
  Search,
  MessageSquare,
  FileText,
  Video,
  LogOut,
  CreditCard,
  User,
  Users,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import type { AccountSummary } from "@/lib/account-types";
import { formatMinutes } from "@/lib/account-types";

const navItems = [
  { index: "01", href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { index: "02", href: "/videos", label: "Library", icon: Film },
  { index: "03", href: "/search", label: "Search", icon: Search },
  { index: "04", href: "/query", label: "Q & A", icon: MessageSquare },
  { index: "05", href: "/summarize", label: "Summarize", icon: FileText },
  { index: "06", href: "/cameras", label: "Cameras", icon: Video },
];

const accountItems = [
  { index: "A1", href: "/account", label: "Account", icon: User },
  { index: "A2", href: "/account/billing", label: "Plan & billing", icon: CreditCard },
];

export function Sidebar({ account }: { account?: AccountSummary }) {
  const pathname = usePathname();
  const { logout } = useAuth();

  const workspaceItems =
    account?.role === "admin"
      ? [...accountItems, { index: "A3", href: "/admin", label: "Admin", icon: Users }]
      : accountItems;

  const handleSignOut = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      /* the cookie is cleared on the next sign-in either way */
    }
    logout();
  };


  return (
    <aside className="flex flex-col w-64 h-screen bg-sidebar text-sidebar-foreground border-r border-sidebar-border shrink-0">
      {/* Brand mark */}
      <div className="px-6 pt-6 pb-5">
        <div className="flex items-center gap-2.5">
          <div className="relative w-7 h-7 flex items-center justify-center">
            <div className="absolute inset-0 border border-primary" />
            <div className="absolute inset-1.5 bg-primary" />
          </div>
          <div className="flex flex-col leading-none">
            <span className="font-serif text-[17px] tracking-editorial text-foreground">
              Videoma
            </span>
            <span className="eyebrow mt-1">console / v1</span>
          </div>
        </div>
      </div>

      <div className="hr-hairline mx-6" />

      {/* Nav */}
      <nav className="flex-1 px-3 py-6 space-y-px overflow-y-auto">
        <div className="px-3 mb-3 eyebrow">Modules</div>
        {navItems.map((item) => (
          <NavLink key={item.href} item={item} pathname={pathname} />
        ))}

        <div className="px-3 mt-6 mb-3 eyebrow">Workspace</div>
        {workspaceItems.map((item) => (
          <NavLink key={item.href} item={item} pathname={pathname} />
        ))}
      </nav>

      <div className="hr-hairline mx-6" />

      {/* Plan + metered usage */}
      {account && <UsagePanel account={account} />}

      <div className="hr-hairline mx-6" />

      {/* Footer / user */}
      <div className="p-4 space-y-3">
        {account && (
          <div className="px-3 py-2 border border-sidebar-border">
            <div className="eyebrow mb-1">Signed in</div>
            <div className="text-sm text-foreground truncate">
              {account.username}
            </div>
            <div className="timecode text-[10px] text-muted-foreground mt-0.5 uppercase">
              {account.role} · {account.planName}
            </div>
          </div>
        )}
        <button
          onClick={handleSignOut}
          className="group w-full flex items-center gap-2.5 px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-sidebar-accent transition-colors"
        >
          <LogOut className="w-3.5 h-3.5" strokeWidth={1.75} />
          <span>Sign out</span>
          <span className="ml-auto timecode text-[10px] opacity-0 group-hover:opacity-100 transition-opacity">
            ⌘Q
          </span>
        </button>
      </div>
    </aside>
  );
}

function NavLink({
  item,
  pathname,
}: {
  item: {
    index: string;
    href: string;
    label: string;
    icon: LucideIcon;
  };
  pathname: string | null;
}) {
  const isActive =
    pathname === item.href ||
    (item.href !== "/account" && pathname?.startsWith(`${item.href}/`));
  const Icon = item.icon;

  return (
    <Link
      href={item.href}
      className={cn(
        "group relative flex items-center gap-3 px-3 py-2.5 text-sm transition-colors",
        isActive
          ? "text-foreground bg-sidebar-accent"
          : "text-muted-foreground hover:text-foreground hover:bg-sidebar-accent/50",
      )}
    >
      {isActive && (
        <span className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-px bg-primary" />
      )}
      <span
        className={cn(
          "timecode text-[11px] w-6",
          isActive ? "text-primary" : "text-muted-foreground/70",
        )}
      >
        {item.index}
      </span>
      <Icon
        className={cn("w-4 h-4 shrink-0", isActive ? "text-primary" : "")}
        strokeWidth={1.75}
      />
      <span className={cn(isActive && "font-medium")}>{item.label}</span>
    </Link>
  );
}

/**
 * "You are on plan X, you have used Y of Z" — the SaaS surface inside the
 * product itself. Mirrors the usage strip on CMSaasStarter's account page.
 */
function UsagePanel({ account }: { account: AccountSummary }) {
  const nearLimit =
    account.percentUsed.queries >= 80 || account.percentUsed.videoMinutes >= 80;
  const suggestUpgrade = account.planId === "free" || nearLimit;

  return (
    <div className="px-4 py-4 space-y-3">
      <div className="px-3 flex items-center justify-between">
        <span className="eyebrow">Plan</span>
        <span className="timecode text-[10px] uppercase text-primary">
          {account.planName}
        </span>
      </div>

      <div className="px-3 space-y-3">
        <UsageBar
          label="Indexed"
          used={account.usage.videoMinutes}
          limit={account.limits.videoMinutesPerMonth}
          percent={account.percentUsed.videoMinutes}
          remaining={account.remaining.videoMinutes}
        />
        <UsageBar
          label="AI calls"
          used={account.usage.queries}
          limit={account.limits.queriesPerMonth}
          percent={account.percentUsed.queries}
          remaining={account.remaining.queries}
        />
      </div>

      {suggestUpgrade && (
        <Link
          href={account.billingEnabled ? "/account/billing" : "/pricing"}
          className="mx-3 flex items-center gap-2 px-3 py-2 border border-primary/40 bg-primary/10 text-[11px] text-foreground hover:bg-primary/15 transition-colors"
        >
          <Sparkles className="w-3 h-3 text-primary shrink-0" strokeWidth={1.75} />
          <span className="truncate">
            {account.planId === "free" ? "Upgrade for headroom" : "Running low — manage plan"}
          </span>
        </Link>
      )}
    </div>
  );
}

function UsageBar({
  label,
  used,
  limit,
  percent,
  remaining,
}: {
  label: string;
  used: number;
  limit: number | null;
  percent: number;
  remaining: number | null;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="timecode text-[10px] text-muted-foreground">{label}</span>
        <span className="timecode text-[10px] text-muted-foreground">
          {used.toLocaleString()}
          <span className="opacity-60">
            {" / "}
            {limit === null ? "∞" : limit.toLocaleString()}
          </span>
        </span>
      </div>
      <div className="mt-1.5 h-px w-full bg-border">
        <div
          className={cn(
            "h-px",
            percent >= 90 ? "bg-err" : percent >= 70 ? "bg-warn" : "bg-primary",
          )}
          style={{ width: `${limit === null ? 100 : Math.max(percent, used > 0 ? 3 : 0)}%` }}
        />
      </div>
      <div className="mt-1 timecode text-[9px] text-muted-foreground/70">
        {remaining === null ? "unlimited" : `${formatMinutes(remaining)} left`}
      </div>
    </div>
  );
}
