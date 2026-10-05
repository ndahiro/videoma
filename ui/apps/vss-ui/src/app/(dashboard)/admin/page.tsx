import { notFound } from "next/navigation";
import { requireSession } from "@/lib/session";
import { listAccounts } from "@/lib/admin";
import { PageHeader } from "@/components/layout/page-header";
import { AdminClient } from "./admin-client";

/**
 * /admin — accounts, plans and metered usage.
 * Admin-only: mirrors CMSaasStarter's admin user list, extended with the plan
 * override that makes the product usable when Stripe is not configured.
 */
export default async function AdminPage() {
  const { user } = await requireSession();
  if (user.role !== "admin") notFound();

  const { accounts, period } = await listAccounts({ limit: 200 });

  return (
    <div>
      <PageHeader
        index="A3"
        title="Admin"
        description="Every account, the plan it is on and what it has consumed this month."
        meta="Workspace"
      />
      <section className="px-8 py-8">
        <AdminClient
          accounts={accounts.map((account) => ({
            ...account,
            currentPeriodEnd: account.currentPeriodEnd?.toISOString() ?? null,
            createdAt: account.createdAt.toISOString(),
            lastLoginAt: account.lastLoginAt?.toISOString() ?? null,
          }))}
          period={{ start: period.start.toISOString(), end: period.end.toISOString() }}
          currentUserId={user.id}
        />
      </section>
    </div>
  );
}
