import type { Metadata } from "next";

import { GrowthExperimentsView } from "@/components/growth";
import { requireAdmin } from "@/lib/auth/admin";
import { loadGrowthWorkspace } from "@/lib/growth";

import { createExperimentAction, recordExperimentResultAction, runProfileAuditAction } from "./actions";

export const metadata: Metadata = {
  title: "Experiments · CreatorOS Personal",
};

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

type ExperimentsPageProps = {
  searchParams?: Promise<SearchParams>;
};

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function ExperimentsPage({ searchParams }: ExperimentsPageProps) {
  const admin = await requireAdmin();
  const params = (await searchParams) ?? {};
  const filters = {
    notice: firstValue(params.notice),
    selectedExperiment: firstValue(params.selectedExperiment),
  };
  const workspace = await loadGrowthWorkspace(admin, filters);

  return (
    <GrowthExperimentsView
      createExperimentAction={createExperimentAction}
      notice={filters.notice}
      recordExperimentResultAction={recordExperimentResultAction}
      runProfileAuditAction={runProfileAuditAction}
      workspace={workspace}
    />
  );
}
