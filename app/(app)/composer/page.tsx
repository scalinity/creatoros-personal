import { ComposerWorkspaceView } from "@/components/composer";
import { requireAdmin } from "@/lib/auth/admin";
import { loadComposerWorkspace, type ComposerFilters, type ComposerIdeaStatus } from "@/lib/content";

import {
  archiveContentIdeaAction,
  createContentIdeaAction,
  saveGeneratedOutputAction,
  updateContentIdeaAction,
  updateGeneratedOutputStatusAction,
} from "./actions";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

type ComposerPageProps = {
  searchParams?: Promise<SearchParams>;
};

const validStatuses = new Set<ComposerIdeaStatus | "all">(["active", "all", "archived", "drafted", "inbox", "used"]);

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function filtersFromSearchParams(searchParams: SearchParams): ComposerFilters & { notice?: string } {
  const status = firstValue(searchParams.status);

  return {
    notice: firstValue(searchParams.notice),
    q: firstValue(searchParams.q) ?? "",
    selected: firstValue(searchParams.selected),
    source: firstValue(searchParams.source) ?? "",
    status: status && validStatuses.has(status as ComposerIdeaStatus | "all") ? (status as ComposerIdeaStatus | "all") : "",
  };
}

export default async function ComposerPage({ searchParams }: ComposerPageProps) {
  const admin = await requireAdmin();
  const params = filtersFromSearchParams((await searchParams) ?? {});
  const { ideas, outputs, selectedIdea } = await loadComposerWorkspace(admin, params);

  return (
    <ComposerWorkspaceView
      archiveIdeaAction={archiveContentIdeaAction}
      createIdeaAction={createContentIdeaAction}
      filters={params}
      ideas={ideas}
      notice={params.notice}
      outputs={outputs}
      saveOutputAction={saveGeneratedOutputAction}
      selectedIdea={selectedIdea}
      updateIdeaAction={updateContentIdeaAction}
      updateOutputAction={updateGeneratedOutputStatusAction}
    />
  );
}
