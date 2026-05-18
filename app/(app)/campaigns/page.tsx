import type { Metadata } from "next";

import { GrowthCampaignsView } from "@/components/growth";
import { requireAdmin } from "@/lib/auth/admin";
import { loadGrowthWorkspace } from "@/lib/growth";

import {
  addCampaignItemAction,
  createCampaignAction,
  createContentPillarAction,
  createGrowthGoalAction,
  runMonthlyGrowthReviewAction,
  runWeeklyGrowthReviewAction,
} from "./actions";

export const metadata: Metadata = {
  title: "Campaigns · CreatorOS Personal",
};

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

type CampaignsPageProps = {
  searchParams?: Promise<SearchParams>;
};

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function CampaignsPage({ searchParams }: CampaignsPageProps) {
  const admin = await requireAdmin();
  const params = (await searchParams) ?? {};
  const filters = {
    notice: firstValue(params.notice),
    selectedCampaign: firstValue(params.selectedCampaign),
  };
  const workspace = await loadGrowthWorkspace(admin, filters);

  return (
    <GrowthCampaignsView
      addCampaignItemAction={addCampaignItemAction}
      createCampaignAction={createCampaignAction}
      createGoalAction={createGrowthGoalAction}
      createPillarAction={createContentPillarAction}
      notice={filters.notice}
      runMonthlyReviewAction={runMonthlyGrowthReviewAction}
      runWeeklyReviewAction={runWeeklyGrowthReviewAction}
      workspace={workspace}
    />
  );
}
