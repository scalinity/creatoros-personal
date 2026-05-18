import type { Metadata } from "next";

import { ReplyGuyWorkspaceView } from "@/components/reply-guy";
import { requireAdmin } from "@/lib/auth/admin";
import { loadReplyGuyWorkspace } from "@/lib/reply-guy";

import {
  archiveTargetAccountAction,
  createReplyPublishingDraftAction,
  createTargetAccountAction,
  generateReplyDraftsAction,
  importTargetPostAction,
  markReplyCopiedAction,
  markReplyUsedAction,
  pasteTargetPostsAction,
} from "./actions";

export const metadata: Metadata = {
  title: "Reply Guy · CreatorOS Personal",
};

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

type ReplyGuyPageProps = {
  searchParams?: Promise<SearchParams>;
};

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function ReplyGuyPage({ searchParams }: ReplyGuyPageProps) {
  const admin = await requireAdmin();
  const params = (await searchParams) ?? {};
  const filters = {
    notice: firstValue(params.notice),
    post: firstValue(params.post),
    selected: firstValue(params.selected),
  };
  const workspace = await loadReplyGuyWorkspace(admin, filters);

  return (
    <ReplyGuyWorkspaceView
      archiveTargetAction={archiveTargetAccountAction}
      createTargetAction={createTargetAccountAction}
      generateReplyAction={generateReplyDraftsAction}
      handoffAction={createReplyPublishingDraftAction}
      importPostAction={importTargetPostAction}
      markCopiedAction={markReplyCopiedAction}
      markUsedAction={markReplyUsedAction}
      notice={filters.notice}
      pastePostsAction={pasteTargetPostsAction}
      workspace={workspace}
    />
  );
}
