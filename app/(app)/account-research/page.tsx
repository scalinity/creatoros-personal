import { AccountResearchWorkspaceView } from "@/components/account-research";
import { requireAdmin } from "@/lib/auth/admin";
import { loadAccountResearchWorkspace } from "@/lib/account-research";

import { runAccountResearchAction, saveAccountResearchIdeaAction } from "./actions";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

type AccountResearchPageProps = {
  searchParams?: Promise<SearchParams>;
};

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function AccountResearchPage({ searchParams }: AccountResearchPageProps) {
  const admin = await requireAdmin();
  const params = (await searchParams) ?? {};
  const filters = {
    notice: firstValue(params.notice),
    selected: firstValue(params.selected),
  };
  const workspace = await loadAccountResearchWorkspace(admin, filters);

  return <AccountResearchWorkspaceView notice={filters.notice} researchAction={runAccountResearchAction} saveIdeaAction={saveAccountResearchIdeaAction} workspace={workspace} />;
}
