# design/component-map.md

## Primitive Map

| Product need | Design component |
|---|---|
| Primary action | `Button variant=primary` |
| Secondary action | `Button variant=secondary` |
| Destructive action | `Button variant=destructive` |
| Inline text action | `Button variant=tertiary` |
| URLs/IDs/tokens | `Input mono` |
| Draft/blog text | `Textarea` or blog editor frame using field anatomy |
| Status | `Badge` variants |
| Sections | `RuleHeader` with folio |
| Containers | `Card` default/inset/elevated |
| Details | `KeyValueRow` |
| Dense data | `Table` |
| Scores | `ScoreGauge` |
| Metrics | `MetricBlock` |
| Coach | `ChatMessage` + evidence drawer |
| Draft variants | `RewriteCard` |
| Replies | `ReplyDraftCard` |
| Inspiration | `InspirationCard` |
| Warnings | `AssumptionFlag` or `ErrorFallback` |
| Navigation | `Sidebar`, `TopBar`, `CommandPalette` |
| Detail pane | `Inspector` or `Sheet` on mobile |

## Screen Map

| Route | Required design composition |
|---|---|
| `/login` | Brand mark, Card, Fields, Button, no marketing layout. |
| `/dashboard` | RuleHeader sections, MetricBlock grid, Queue Table, Suggestion Cards, badges. |
| `/publishing` | Tabs, PublishingQueueRow table, ApprovalRail inspector, FailureCard. |
| `/calendar` | CalendarDayCell grid, badges, inspector sheet. |
| `/composer` | Idea cards/table, Textarea, RewriteCard outputs, Inspector source panel. |
| `/algo-analyzer` | Textarea, ScoreGauge set, RewriteCard list, Risk AssumptionFlags. |
| `/brain-dump` | Large Textarea, Tabs, Cards for extracted packs, Save actions. |
| `/blogs` | Blog table, status badges, export actions. |
| `/blogs/[id]` | BlogEditorFrame, metadata KeyValueRows, version Table, export Card. |
| `/analytics` | MetricBlock grid, dense Tables, ScoreGauge summaries. |
| `/experiments` | ExperimentLedger table, result inspector, decision badges. |
| `/campaigns` | CampaignCard grid, campaign item Table, MetricBlocks. |
| `/coach` | ChatMessage thread, evidence inspector, Recommendation Cards. |
| `/reply-guy` | Target account table, ReplyDraftCard, ApprovalRail for publish. |
| `/account-research` | Input Card, report Cards, top-post Table, generated ideas. |
| `/post-history` | PostRow list/Table, filters, inspector with score and snapshots. |
| `/inspiration` | InspirationCard library, plagiarism warning, transform cards. |
| `/settings/*` | KeyValueRows, Fields, TokenManagementRow, Diagnostics tables. |

## Domain Components to Build

- `PublishingQueueRow`
- `ApprovalRail`
- `PublishFailureCard`
- `CalendarDayCell`
- `BlogEditorFrame`
- `BlogVersionTimeline`
- `CampaignCard`
- `ExperimentLedger`
- `GrowthReviewSection`
- `ProfileAuditCard`
- `TokenManagementRow`

All domain components must use existing tokens and component anatomy.
