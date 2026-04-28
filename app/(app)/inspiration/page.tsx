import { InspirationWorkspaceView } from "@/components/inspiration";
import { requireAdmin } from "@/lib/auth/admin";
import { loadInspirationWorkspace } from "@/lib/inspiration";

import {
  createInspirationAction,
  deleteInspirationAction,
  transformInspirationAction,
  updateInspirationAction,
} from "./actions";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

type InspirationPageProps = {
  searchParams?: Promise<SearchParams>;
};

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function InspirationPage({ searchParams }: InspirationPageProps) {
  const admin = await requireAdmin();
  const params = (await searchParams) ?? {};
  const filters = {
    notice: firstValue(params.notice),
    q: firstValue(params.q),
    selected: firstValue(params.selected),
    tag: firstValue(params.tag),
  };
  const workspace = await loadInspirationWorkspace(admin, filters);

  return (
    <InspirationWorkspaceView
      createAction={createInspirationAction}
      deleteAction={deleteInspirationAction}
      filters={filters}
      transformAction={transformInspirationAction}
      updateAction={updateInspirationAction}
      workspace={workspace}
    />
  );
}
