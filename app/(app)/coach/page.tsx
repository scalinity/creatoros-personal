import { CoachWorkspaceView } from "@/components/coach";
import { requireAdmin } from "@/lib/auth/admin";
import { loadCoachWorkspace } from "@/lib/coach";

import { askCoachAction, generateCoachPlaybookAction } from "./actions";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

type CoachPageProps = {
  searchParams?: Promise<SearchParams>;
};

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function CoachPage({ searchParams }: CoachPageProps) {
  const admin = await requireAdmin();
  const params = (await searchParams) ?? {};
  const workspace = await loadCoachWorkspace(admin, {
    notice: firstValue(params.notice),
    selected: firstValue(params.selected),
  });

  return <CoachWorkspaceView askAction={askCoachAction} generatePlaybookAction={generateCoachPlaybookAction} workspace={workspace} />;
}
