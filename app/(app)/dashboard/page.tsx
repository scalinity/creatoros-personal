import { DashboardView } from "@/components/dashboard";
import { requireAdmin } from "@/lib/auth/admin";
import { loadDashboardSummary } from "@/lib/analytics/loaders";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const admin = await requireAdmin();
  const summary = await loadDashboardSummary(admin);

  return <DashboardView summary={summary} />;
}
