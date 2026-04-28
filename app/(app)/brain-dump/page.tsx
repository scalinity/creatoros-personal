import { BrainDumpWorkspaceView } from "@/components/brain-dump";
import { requireAdmin } from "@/lib/auth/admin";
import { loadBrainDumpWorkspace } from "@/lib/brain-dumps";

import { saveBrainDumpOutputAction, transformBrainDumpAction } from "./actions";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

type BrainDumpPageProps = {
  searchParams?: Promise<SearchParams>;
};

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function BrainDumpPage({ searchParams }: BrainDumpPageProps) {
  const admin = await requireAdmin();
  const params = (await searchParams) ?? {};
  const selected = firstValue(params.selected);
  const notice = firstValue(params.notice);
  const { dumps, selectedDump } = await loadBrainDumpWorkspace(admin, selected);

  return (
    <BrainDumpWorkspaceView
      brainDump={selectedDump}
      dumps={dumps}
      notice={notice}
      saveOutputAction={saveBrainDumpOutputAction}
      transformAction={transformBrainDumpAction}
    />
  );
}
