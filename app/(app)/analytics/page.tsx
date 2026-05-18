import type { Metadata } from "next";

import { AnalyticsView } from "@/components/analytics";
import { requireAdmin } from "@/lib/auth/admin";
import { loadAnalyticsReport } from "@/lib/analytics/loaders";

export const metadata: Metadata = {
  title: "Analytics · CreatorOS Personal",
};

export const dynamic = "force-dynamic";

export default async function AnalyticsPage() {
  const admin = await requireAdmin();
  const report = await loadAnalyticsReport(admin);

  return <AnalyticsView report={report} />;
}
