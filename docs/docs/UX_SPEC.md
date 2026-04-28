# docs/UX_SPEC.md

## Global UX Model

CreatorOS Personal uses a three-zone layout:

```text
Sidebar 240px | Main workbench | Optional inspector 360px
Topbar 48px spans main + inspector
```

The sidebar is navigation and status. The main workbench is where writing, analysis, queues, calendars, and reports happen. The inspector is for selected object details, publishing review payloads, evidence, score explanations, version history, or job diagnostics.

## Navigation

Primary sidebar groups:

- `§ Ⅰ — OPERATE`: Dashboard, Publishing, Calendar, Composer, Brain Dump.
- `§ Ⅱ — INTELLIGENCE`: Coach, Algo Analyzer, Analytics, Experiments.
- `§ Ⅲ — ARCHIVE`: Post History, Blogs, Inspiration.
- `§ Ⅳ — NETWORK`: Reply Guy, Account Research, Campaigns.
- `§ Ⅴ — SYSTEM`: Settings.

Icons are typographic glyphs, not emoji. Use mono single-character symbols at consistent x-height.

## Command Palette

`⌘K` / `Ctrl+K` opens the command palette. Commands include:

- Write post.
- Compose thread.
- Draft blog.
- Analyze draft.
- Schedule approved draft.
- Review publishing queue.
- Import posts.
- Research account.
- Save inspiration.
- Generate voice profile.
- Create experiment.
- Run weekly growth review.
- Export data.

Command groups use small folios and dense rows.

## `/login`

Minimal private login surface.

Required UI:

- Centered brand mark: `CreatorOS Ⅰ`.
- Copy: `Private workspace.`
- Email/password or magic-link form.
- Error states for invalid credentials and not-allowlisted.
- No signup, no marketing, no onboarding checklist.

Design:

- Use surface card with hairline border.
- Brand in Fraunces smallcaps + vermillion mono folio.
- Fields bottom-rule only.

## `/dashboard`

Dense private cockpit.

Sections:

1. `§ 01 — STATUS`
   - X connection status.
   - Publishing permission status.
   - Last sync.
   - Scheduled posts count.
   - Failed publishing jobs.
   - AI provider readiness.
2. `§ 02 — QUEUE`
   - Due today.
   - Next scheduled.
   - Failed/retryable.
   - Needs approval.
3. `§ 03 — ARCHIVE`
   - Posts imported.
   - Ideas.
   - Generated drafts.
   - Blogs drafted.
4. `§ 04 — PERFORMANCE`
   - Recent post performance.
   - Top posts.
   - Best topics/hooks/formats.
   - Growth deltas.
5. `§ 05 — STRATEGY`
   - Active campaigns.
   - Current experiments.
   - Underused ideas.
   - Profile audit warnings.
6. `§ 06 — DAILY SUGGESTIONS`
   - One content idea.
   - One post to repurpose.
   - One blog idea.
   - One target account to engage.
   - One profile-growth insight.
   - One warning/risk.

Quick actions:

- Write post.
- Schedule post.
- Analyze draft.
- Brain dump.
- Compose thread.
- Draft blog.
- Research account.
- Open reply feed.
- Import posts.
- Review publishing queue.

Design:

- MetricBlocks in a 4-column grid desktop, 2-column tablet, 1-column mobile.
- Queue uses Table or PublishingQueueRow.
- Suggestions are Card + ConfidenceLabel + evidence footnotes.

## `/publishing`

Primary publishing queue and approval surface.

Views:

- Needs approval.
- Approved.
- Scheduled.
- Publishing.
- Published.
- Failed.
- Canceled.
- Archived.

Main table columns:

- Draft id.
- Type.
- Status.
- Scheduled time.
- Campaign.
- Experiment.
- Risk.
- Last action.
- Actions.

Inspector for selected draft:

- Exact content payload.
- Media assets.
- Reply/quote target.
- X account.
- Required scopes.
- Similarity/duplicate check.
- Algo score.
- Approval history.
- Publish/schedule/cancel/retry actions.

Guardrail UX:

- Immediate publish requires confirmation dialog showing exact post account and payload.
- Scheduled publish requires approved state first.
- Failed jobs show sanitized X error and retry eligibility.

## `/calendar`

Timezone-aware content calendar.

Views:

- Week.
- Month.
- Agenda.
- Publishing load by day.

Calendar cells:

- Dense hairline boxes, no colorful calendar SaaS aesthetic.
- Each item uses status badge and mono time.
- Conflict warnings for cadence overload.

Actions:

- Drag/reschedule approved scheduled content if implemented safely.
- Click item opens inspector.
- Create placeholder idea/campaign slot.

## `/composer`

Workbench for ideas, drafts, generated outputs, and publishing handoff.

Sections:

- Idea inbox.
- Drafts.
- Generated outputs.
- Content packs.
- Source inspector.

Composer modes:

- Single X post.
- X thread.
- Reply.
- Quote post.
- Blog outline.
- Blog draft.
- Blog-to-X sequence.
- Campaign sequence.
- Repurpose old post.
- Transform inspiration.

Actions:

- Analyze.
- Save draft.
- Create publishing draft.
- Approve for publishing.
- Schedule.
- Link to campaign/experiment.

## `/algo-analyzer`

Heuristic draft analyzer. Required banner: `Heuristic analyzer — not the official X algorithm.`

UI:

- Large textarea.
- Content type selector: post/thread/reply/quote/blog-to-X.
- Use voice profile toggle.
- Include publish-readiness toggle.
- Generate thread toggle.
- Score cards for 9 metrics.
- Overall score gauge.
- Risk warnings.
- Rewrites.
- Publish-readiness panel.
- Actions: copy, save output, create publishing draft, schedule after approval.

## `/brain-dump`

Long-form messy input to structured content.

Outputs:

- Themes.
- Claims/opinions.
- Stories/examples.
- Contradictions.
- Strong lines.
- 10 posts.
- 3 threads.
- 3 blog outlines.
- 3 video scripts.
- 3 campaign ideas.
- Clarifying questions.

Actions:

- Save selected to composer.
- Create blog.
- Create campaign.
- Create publishing drafts.

## `/blogs`, `/blogs/new`, `/blogs/[id]`

Blog system UI.

`/blogs`:

- Table/list with status, title, slug, tags, word count, updated, export status, linked X campaigns.
- Filter by status/tags/source/campaign.

`/blogs/new`:

- Start from blank, idea, post, brain dump, inspiration, account report, campaign brief.

`/blogs/[id]`:

- Blog editor frame.
- Metadata panel.
- Version timeline.
- SEO panel.
- Repurposing panel.
- Export panel.
- Inspector with evidence/source links.

Design:

- Long-form editor uses wider measure and 1.7 leading.
- Title in Fraunces.
- Metadata in dense KeyValueRows.

## `/campaigns`

Campaign management.

Views:

- Active campaigns.
- Planned.
- Completed.
- Archived.

Campaign detail:

- Goal.
- Pillar.
- Hypothesis.
- Included posts/blogs/replies.
- Schedule.
- Results.
- AI interpretation.
- Decision.

## `/experiments`

Experiment ledger.

Experiment types:

- Hook.
- Topic.
- Format.
- Posting-time.
- CTA.
- Reply strategy.
- Blog repurposing.

UI:

- Table with hypothesis, window, status, content count, metrics, decision.
- Detail inspector with included content and result.
- AI interpretation after end date.

## `/analytics`

Analytics dashboard.

Sections:

- Performance summary.
- Score explanations.
- Best/worst hooks.
- Best/worst topics.
- Best/worst formats.
- Cadence heatmap.
- Post-publish velocity.
- Follower growth/manual import.
- Campaign/experiment results.
- Blog export/performance where imported.

Design:

- Dense metric blocks and tables.
- Use score gauges for index-like metrics.
- Avoid colorful chart palettes; use vermillion/moss/ochre/rust sparingly.

## `/coach`

Chat UI with evidence drawer.

Suggested prompts:

- What should I post today?
- What should I publish this week?
- What blog should I write next?
- Which topics are working?
- Which hooks should I reuse?
- What should I stop posting?
- What should I repurpose?
- What account should I engage with?
- What experiment should I run next?
- What content is actually moving growth?

Coach answer cards include:

- Answer.
- Diagnosis.
- Evidence.
- Recommendations.
- Draft posts/blog ideas.
- Confidence labels.
- Cited records.

## `/reply-guy`

Target account and reply workflow.

- Target accounts list.
- Target post feed/paste fallback.
- Reply draft generation.
- Approval before posting.
- Optional direct publish after approval.
- Used/copied/published tracking.

No mass reply UX. No batch publish button.

## `/account-research`

Inputs:

- Username.
- Pasted posts.
- Imported target posts.
- API fetch if capability enabled.

Outputs:

- Account summary.
- Pillars.
- Hooks.
- Formats.
- Positioning.
- Audience hypothesis.
- Engagement patterns.
- Reply strategy.
- Ethical inspiration extraction.
- Post ideas.
- Blog ideas.
- Campaign ideas.

## `/post-history`

Searchable archive with publishing and blog integration.

Filters:

- Date range.
- Topic.
- Format.
- Hook type.
- Tone.
- Performance bucket.
- Source.
- Contains media.
- Contains link.
- Published by app/manual/import.

Actions:

- Edit metrics.
- Categorize.
- Repurpose to publishing draft.
- Expand to blog.
- Add to campaign/experiment.

## `/inspiration`

Library and transformation.

- Save form.
- Extension-save status.
- Tags/notes.
- Plagiarism guard.
- Transform to post/thread/blog/campaign.
- Save to composer.

## `/settings/*`

- X connection and scope escalation.
- AI provider/model routing.
- Data export/delete.
- Personal save tokens.
- Diagnostics.

Diagnostics must show secret presence/missing only.

## Responsive Behavior

- Desktop: sidebar + main + optional inspector.
- Tablet: collapsible sidebar, inspector becomes sheet.
- Mobile: drawer nav, tables become cards or horizontal scroll, publish approval uses stacked payload review.

## Acceptance Criteria

- Every route has loading, empty, error, and failure states.
- Every external write action includes visible preview and confirmation/approval state.
- UI strictly follows the attached design system.
- No marketing/onboarding/SaaS UI appears.
