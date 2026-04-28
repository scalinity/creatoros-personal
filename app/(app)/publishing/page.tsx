import { PublishingWorkspaceView } from "@/components/publishing";
import { requireAdmin } from "@/lib/auth/admin";
import { loadPublishingWorkspace } from "@/lib/publishing";

import {
  approvePublishingDraftAction,
  cancelPublishingDraftAction,
  createPublishingDraftAction,
  retryPublishingJobAction,
  runDryRunPublishingAction,
  schedulePublishingDraftAction,
  updatePublishingDraftAction,
} from "./actions";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

type PublishingPageProps = {
  searchParams?: Promise<SearchParams>;
};

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function PublishingPage({ searchParams }: PublishingPageProps) {
  const admin = await requireAdmin();
  const query = (await searchParams) ?? {};
  const workspace = await loadPublishingWorkspace(admin);

  return (
    <PublishingWorkspaceView
      approveAction={approvePublishingDraftAction}
      cancelAction={cancelPublishingDraftAction}
      createAction={createPublishingDraftAction}
      dryRunAction={runDryRunPublishingAction}
      editAction={updatePublishingDraftAction}
      notice={firstValue(query.notice)}
      retryAction={retryPublishingJobAction}
      scheduleAction={schedulePublishingDraftAction}
      selectedDraftId={firstValue(query.selected)}
      workspace={workspace}
    />
  );
}
