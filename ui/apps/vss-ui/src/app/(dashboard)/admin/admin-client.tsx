"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { pricingPlans } from "@/lib/plans";

export interface AdminAccountRow {
  id: string;
  username: string;
  email: string | null;
  role: string;
  planId: string;
  subscriptionStatus: string;
  currentPeriodEnd: string | null;
  createdAt: string;
  lastLoginAt: string | null;
  usage: { minutes: number; queries: number };
}

/**
 * Plan overrides + role changes. This is the "comp an account" escape hatch —
 * the admin equivalent of granting a subscription without going through Stripe.
 */
export function AdminClient({
  accounts,
  period,
  currentUserId,
}: {
  accounts: AdminAccountRow[];
  period: { start: string; end: string };
  currentUserId: string;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const patch = async (id: string, body: Record<string, unknown>) => {
    setBusyId(id);
    try {
      const res = await fetch(`/api/admin/users/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.message || "Update failed.");
      toast({
        title: "Account updated",
        description: "The change is live immediately.",
      });
      router.refresh();
    } catch (err) {
      toast({
        title: "Update failed",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setBusyId(null);
    }
  };

  const visible = accounts.filter((account) =>
    query
      ? account.username.toLowerCase().includes(query.toLowerCase()) ||
        (account.email ?? "").toLowerCase().includes(query.toLowerCase())
      : true,
  );

  const totals = accounts.reduce(
    (acc, account) => ({
      minutes: acc.minutes + account.usage.minutes,
      queries: acc.queries + account.usage.queries,
      paid: acc.paid + (account.planId === "free" ? 0 : 1),
    }),
    { minutes: 0, queries: 0, paid: 0 },
  );

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Accounts" value={String(accounts.length)} />
        <Stat label="Paid accounts" value={String(totals.paid)} />
        <Stat
          label="Indexed this month"
          value={`${totals.minutes.toLocaleString()} min`}
        />
      </div>

      <div className="flex items-center justify-between gap-4">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter by username or email"
          className="h-9 w-72 border border-border bg-input px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />
        <span className="timecode text-[10px] text-muted-foreground">
          period {new Date(period.start).toLocaleDateString()} —{" "}
          {new Date(period.end).toLocaleDateString()}
        </span>
      </div>

      <AccountTable
        accounts={visible}
        busyId={busyId}
        currentUserId={currentUserId}
        onPatch={patch}
      />
    </div>
  );
}

function AccountTable({
  accounts,
  busyId,
  currentUserId,
  onPatch,
}: {
  accounts: AdminAccountRow[];
  busyId: string | null;
  currentUserId: string;
  onPatch: (id: string, body: Record<string, unknown>) => void;
}) {
  return (
    <Card>
      <CardContent className="pt-6 px-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="eyebrow">Account</TableHead>
              <TableHead className="eyebrow">Plan</TableHead>
              <TableHead className="eyebrow">Status</TableHead>
              <TableHead className="eyebrow text-right">Minutes</TableHead>
              <TableHead className="eyebrow text-right">AI calls</TableHead>
              <TableHead className="eyebrow">Role</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {accounts.map((account) => (
              <TableRow key={account.id}>
                <TableCell>
                  <div className="text-sm text-foreground">{account.username}</div>
                  <div className="timecode text-[10px] text-muted-foreground">
                    {account.email ?? "no email"}
                  </div>
                </TableCell>
                <TableCell>
                  <Select
                    value={account.planId}
                    disabled={busyId === account.id}
                    onValueChange={(value) => onPatch(account.id, { plan: value })}
                  >
                    <SelectTrigger className="h-8 w-[130px] text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {pricingPlans.map((plan) => (
                        <SelectItem
                          key={plan.id}
                          value={plan.id}
                          className="text-xs"
                        >
                          {plan.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell className="timecode text-[10px] uppercase text-muted-foreground">
                  {account.subscriptionStatus}
                </TableCell>
                <TableCell className="timecode text-[11px] text-right">
                  {account.usage.minutes.toLocaleString()}
                </TableCell>
                <TableCell className="timecode text-[11px] text-right">
                  {account.usage.queries.toLocaleString()}
                </TableCell>
                <TableCell>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={busyId === account.id || account.id === currentUserId}
                    onClick={() =>
                      onPatch(account.id, {
                        role: account.role === "admin" ? "user" : "admin",
                      })
                    }
                  >
                    {account.role === "admin" ? "Revoke admin" : "Make admin"}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-card-border bg-card px-5 py-4">
      <div className="eyebrow mb-2">{label}</div>
      <div className="font-serif text-2xl tracking-editorial">{value}</div>
    </div>
  );
}
