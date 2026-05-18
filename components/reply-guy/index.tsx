import Link from "next/link";
import type { ComponentProps } from "react";

import { CopyButton } from "@/components/ai/copy-button";
import { Badge, Card, EmptyState, Input, KeyValueRow, MetricBlock, RuleHeader, Select, SubmitButton, Table, Textarea, cn } from "@/components/design-system";
import type { ReplyDraft, ReplyGuyWorkspace, TargetAccount, TargetPost } from "@/lib/reply-guy";

export type FormAction = ComponentProps<"form">["action"];

export type ReplyGuyWorkspaceViewProps = {
  archiveTargetAction?: FormAction;
  createTargetAction?: FormAction;
  generateReplyAction?: FormAction;
  handoffAction?: FormAction;
  importPostAction?: FormAction;
  markCopiedAction?: FormAction;
  markUsedAction?: FormAction;
  notice?: string;
  pastePostsAction?: FormAction;
  workspace: ReplyGuyWorkspace;
};

const replyTypeOptions = [
  { label: "Thoughtful value-add", value: "thoughtful_value_add" },
  { label: "Question", value: "question" },
  { label: "Respectful disagreement", value: "respectful_disagreement" },
  { label: "Concise punchy", value: "concise_punchy" },
  { label: "Friendly support", value: "friendly_support" },
  { label: "Technical expansion", value: "technical_expansion" },
  { label: "Personal anecdote", value: "personal_anecdote" },
];

function formatDate(value: null | string | undefined) {
  if (!value) return "undated";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "undated";
  return new Intl.DateTimeFormat("en-US", { day: "2-digit", month: "short", year: "numeric" }).format(date);
}

function statusVariant(status: string) {
  if (status === "used" || status === "handoff") return "success";
  if (status === "copied") return "accent";
  if (status === "failed") return "danger";
  return "outline";
}

const noticeCopy: Record<string, { tone: "error" | "success"; text: string }> = {
  handoff_created: { text: "Publishing draft created for later owner approval.", tone: "success" },
  handoff_failed: { text: "Publishing handoff failed. Use a saved target post with an X status URL before handoff.", tone: "error" },
  post_failed: { text: "Target post import failed. Check the pasted post and try again.", tone: "error" },
  post_saved: { text: "Target post saved.", tone: "success" },
  posts_imported: { text: "Pasted target posts imported.", tone: "success" },
  rate_limited: { text: "Action rate limit reached. Wait a bit before retrying.", tone: "error" },
  reply_action_failed: { text: "Reply draft update failed.", tone: "error" },
  reply_copied: { text: "Reply copied marker updated.", tone: "success" },
  reply_failed: { text: "Reply generation failed. Check the selected post and try again.", tone: "error" },
  reply_generated: { text: "Reply drafts generated for review.", tone: "success" },
  reply_used: { text: "Reply marked used.", tone: "success" },
  target_archive_failed: { text: "Target account archive failed.", tone: "error" },
  target_archived: { text: "Target account archived.", tone: "success" },
  target_failed: { text: "Target account save failed.", tone: "error" },
  target_saved: { text: "Target account saved.", tone: "success" },
};

function NoticeBanner({ notice }: { notice?: string }) {
  if (!notice) return null;
  const copy = noticeCopy[notice];
  if (!copy) return null;

  return <div className={cn("network-notice", copy.tone === "error" && "network-notice-error")} role={copy.tone === "error" ? "alert" : "status"}>{copy.text}</div>;
}

function TargetAccountForm({ action }: { action?: FormAction }) {
  return (
    <Card className="network-create" variant="inset">
      <Card.Body>
        <form action={action} className="network-form">
          <RuleHeader folio="§ 01" id="reply-guy-target-form-title" label="Target Account" sub="save or update" />
          <div className="network-form-grid">
            <Input label="Username" name="username" placeholder="@thoughtfulbuilder" required />
            <Input label="Display" name="display_name" placeholder="Name" />
            <Input label="Niche" name="niche" placeholder="systems, AI, writing" />
            <Input defaultValue="1" label="Priority" max={5} min={0} name="priority" type="number" />
          </div>
          <Input label="List" name="list_name" placeholder="operators" />
          <Textarea label="Notes" name="notes" placeholder="Reply boundaries, shared interests, context to remember." rows={3} />
          <SubmitButton size="sm">Save target account</SubmitButton>
        </form>
      </Card.Body>
    </Card>
  );
}

function TargetAccountList({ accounts, archiveAction, selected }: { accounts: TargetAccount[]; archiveAction?: FormAction; selected: null | TargetAccount }) {
  if (accounts.length === 0) {
    return <EmptyState message="Save one account, then paste one public target post at a time for reply drafting." title="No target accounts" />;
  }

  return (
    <Card className="network-list">
      <Card.Header>
        <RuleHeader folio="§ 02" label="Targets" sub="account table" />
      </Card.Header>
      <Card.Body>
        <Table
          aria-label="Target accounts"
          columns={[
            { header: "Account", key: "account", rowHeader: true },
            { header: "Posts", key: "posts", numeric: true },
            { header: "Drafts", key: "drafts", numeric: true },
            { header: "Used", key: "used", numeric: true },
            { header: "", key: "actions" },
          ]}
          rows={accounts.map((account) => ({
            account: <Link href={{ pathname: "/reply-guy", query: { selected: account.id } }}>@{account.username}</Link>,
            actions: (
              <form action={archiveAction}>
                <input name="id" type="hidden" value={account.id} />
                <SubmitButton aria-label={`Archive target account @${account.username}`} size="sm" variant="tertiary">Archive</SubmitButton>
              </form>
            ),
            drafts: account.metrics.generated,
            id: account.id,
            posts: account.metrics.posts,
            used: account.metrics.used,
          }))}
          selectedId={selected?.id}
        />
      </Card.Body>
    </Card>
  );
}

function TargetPostCard({ post, selected }: { post: TargetPost; selected?: boolean }) {
  return (
    <article className={cn("network-post-card", selected && "network-post-card-selected")}>
      <Link aria-current={selected ? "page" : undefined} className="network-post-link" href={{ pathname: "/reply-guy", query: { selected: post.targetAccountId, post: post.id } }}>
        <span className="network-post-head">
          <span className="mono">@{post.authorUsername ?? "target"}</span>
          <Badge variant={post.source === "x_api" ? "success" : "outline"}>{post.source}</Badge>
        </span>
        <span className="network-post-text">{post.text}</span>
        <span className="network-post-foot mono">likes {post.likeCount} · replies {post.replyCount} · reposts {post.repostCount}</span>
      </Link>
    </article>
  );
}

function TargetPostPanel({ importPostAction, pastePostsAction, posts, selectedAccount, selectedPost }: { importPostAction?: FormAction; pastePostsAction?: FormAction; posts: TargetPost[]; selectedAccount: null | TargetAccount; selectedPost: null | TargetPost }) {
  if (!selectedAccount) return null;

  return (
    <Card className="network-post-panel">
      <Card.Header>
        <RuleHeader folio="§ 03" id="reply-guy-target-posts-title" label="Target Posts" sub={`@${selectedAccount.username}`} />
      </Card.Header>
      <Card.Body>
        <form action={importPostAction} className="network-form">
          <input name="target_account_id" type="hidden" value={selectedAccount.id} />
          <Textarea label="Paste target post" name="text" placeholder="Paste one public post. External text is treated as untrusted data." required rows={4} />
          <div className="network-form-grid">
            <Input label="URL" name="url" placeholder="https://x.com/user/status/123" type="url" />
            <Input label="Likes" min={0} name="like_count" type="number" />
            <Input label="Replies" min={0} name="reply_count" type="number" />
            <Input label="Reposts" min={0} name="repost_count" type="number" />
          </div>
          <SubmitButton size="sm" variant="secondary">Save post</SubmitButton>
        </form>
        <form action={pastePostsAction} className="network-form network-bulk-paste">
          <input name="target_account_id" type="hidden" value={selectedAccount.id} />
          <Textarea label="Pasted posts" name="pasted_posts" placeholder="Paste a small set separated by blank lines for research context." rows={4} />
          <SubmitButton size="sm" variant="tertiary">Import pasted posts</SubmitButton>
        </form>
        <div className="network-post-list">
          {posts.length === 0 ? <EmptyState message="Manual paste remains available even when X read sync is unavailable." title="No target posts" /> : posts.map((post) => <TargetPostCard key={post.id} post={post} selected={post.id === selectedPost?.id} />)}
        </div>
      </Card.Body>
    </Card>
  );
}

function GenerateReplyForm({ action, selectedAccount, selectedPost }: { action?: FormAction; selectedAccount: null | TargetAccount; selectedPost: null | TargetPost }) {
  return (
    <Card className="network-reply-generator" variant="inset">
      <Card.Body>
        <form action={action} className="network-form">
          <RuleHeader folio="§ 04" id="reply-guy-generate-title" label="Reply Draft" sub="one selected post" />
          {selectedAccount ? <input name="target_account_id" type="hidden" value={selectedAccount.id} /> : null}
          {selectedPost ? <input name="target_post_id" type="hidden" value={selectedPost.id} /> : null}
          <Textarea defaultValue={selectedPost?.text ?? ""} label={selectedPost ? "Original post text" : "Paste target post"} name="original_post_text" placeholder="Paste one public target post if no saved post is selected." required={!selectedPost} rows={4} />
          <div className="network-form-grid">
            <Select defaultValue="thoughtful_value_add" label="Reply type" name="reply_type" options={replyTypeOptions} />
            <Input defaultValue="2" label="Draft count" max={3} min={1} name="count" type="number" />
          </div>
          <Textarea label="Owner notes" name="owner_notes" placeholder="Angle, boundary, or relationship context. No relationship is assumed by default." rows={3} />
          <SubmitButton size="sm">Generate replies</SubmitButton>
        </form>
      </Card.Body>
    </Card>
  );
}

export function ReplyDraftCard({ draft, handoffAction, markCopiedAction, markUsedAction }: { draft: ReplyDraft; handoffAction?: FormAction; markCopiedAction?: FormAction; markUsedAction?: FormAction }) {
  const canHandoff = draft.canCreatePublishingHandoff;
  const handoffNote = draft.publishingDraftId
    ? "Publishing draft already created. Review or approve it in Publishing."
    : canHandoff
      ? "Owner approval still happens in Publishing. This handoff does not publish."
      : "Save the target post with an X status URL before publishing handoff.";

  return (
    <article className="reply-draft-card">
      <div className="reply-draft-head">
        <Badge variant={statusVariant(draft.status)}>{draft.status}</Badge>
        <span className="mono">{formatDate(draft.updatedAt)}</span>
      </div>
      <p className="reply-draft-text">{draft.replyText}</p>
      {typeof draft.metadata.rationale === "string" ? <p className="reply-draft-rationale">{draft.metadata.rationale}</p> : null}
      <div className="network-action-row">
        <CopyButton text={draft.replyText} />
        <form action={markCopiedAction}>
          <input name="id" type="hidden" value={draft.id} />
          <SubmitButton size="sm" variant="tertiary">Mark copied</SubmitButton>
        </form>
        <form action={markUsedAction}>
          <input name="id" type="hidden" value={draft.id} />
          <SubmitButton size="sm" variant="tertiary">Mark used</SubmitButton>
        </form>
        <form action={handoffAction}>
          <input name="id" type="hidden" value={draft.id} />
          <input name="confirm_single_reply" type="hidden" value="on" />
          <SubmitButton disabled={Boolean(draft.publishingDraftId) || !canHandoff} size="sm" variant="secondary">Create publishing draft</SubmitButton>
        </form>
      </div>
      <p className="network-muted">{handoffNote}</p>
    </article>
  );
}

function ReplyDraftList({ drafts, handoffAction, markCopiedAction, markUsedAction }: { drafts: ReplyDraft[]; handoffAction?: FormAction; markCopiedAction?: FormAction; markUsedAction?: FormAction }) {
  return (
    <Card className="network-drafts">
      <Card.Header>
        <RuleHeader folio="§ 05" label="Reply Drafts" sub="tracked" />
      </Card.Header>
      <Card.Body>
        <div className="reply-draft-list">
          {drafts.length === 0 ? <EmptyState message="Generate a few reply options for one target post, then copy, mark used, or Create publishing draft for one selected reply. Owner approval still happens in Publishing." title="No reply drafts" /> : drafts.map((draft) => <ReplyDraftCard draft={draft} handoffAction={handoffAction} key={draft.id} markCopiedAction={markCopiedAction} markUsedAction={markUsedAction} />)}
        </div>
      </Card.Body>
    </Card>
  );
}

function ReplyInspector({ selectedAccount, selectedPost }: { selectedAccount: null | TargetAccount; selectedPost: null | TargetPost }) {
  return (
    <aside className="network-inspector">
      <Card>
        <Card.Header>
          <RuleHeader folio="§ 06" label="Approval Rail" sub="guardrails" />
        </Card.Header>
        <Card.Body>
          <KeyValueRow label="Selected account" value={selectedAccount ? `@${selectedAccount.username}` : "none"} />
          <KeyValueRow label="Selected post" value={selectedPost ? selectedPost.text.slice(0, 120) : "manual text fallback"} />
          <KeyValueRow label="Publishing" value="Draft handoff only" />
          <p className="network-muted">Owner approval still happens in Publishing. Replies are generated as drafts, then reviewed in the publishing state machine before any X write.</p>
        </Card.Body>
      </Card>
    </aside>
  );
}

export function ReplyGuyWorkspaceView({ archiveTargetAction, createTargetAction, generateReplyAction, handoffAction, importPostAction, markCopiedAction, markUsedAction, notice, pastePostsAction, workspace }: ReplyGuyWorkspaceViewProps) {
  return (
    <main aria-labelledby="reply-guy-title" className="network-page reply-guy-page">
      <RuleHeader as="h1" folio="§ 21" id="reply-guy-title" label="Reply Guy" sub="thoughtful replies" />
      <NoticeBanner notice={notice} />
      <section aria-labelledby="reply-guy-metrics-title" className="network-metrics">
        <RuleHeader className="visually-hidden" folio="§" id="reply-guy-metrics-title" label="Reply metrics" />
        <MetricBlock label="Targets" value={workspace.metrics.accounts} />
        <MetricBlock label="Posts" value={workspace.metrics.posts} />
        <MetricBlock label="Drafts" value={workspace.metrics.drafts} />
        <MetricBlock label="Used" value={workspace.metrics.used} />
      </section>
      <section className="network-workbench">
        <div className="network-main">
          <TargetAccountForm action={createTargetAction} />
          <TargetAccountList accounts={workspace.accounts} archiveAction={archiveTargetAction} selected={workspace.selectedAccount} />
          <TargetPostPanel importPostAction={importPostAction} pastePostsAction={pastePostsAction} posts={workspace.posts} selectedAccount={workspace.selectedAccount} selectedPost={workspace.selectedPost} />
          <GenerateReplyForm action={generateReplyAction} selectedAccount={workspace.selectedAccount} selectedPost={workspace.selectedPost} />
          <ReplyDraftList drafts={workspace.drafts} handoffAction={handoffAction} markCopiedAction={markCopiedAction} markUsedAction={markUsedAction} />
        </div>
        <ReplyInspector selectedAccount={workspace.selectedAccount} selectedPost={workspace.selectedPost} />
      </section>
    </main>
  );
}
