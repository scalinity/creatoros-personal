# docs/TEST_PLAN.md

## Test Layers

- Unit tests with Vitest.
- Service/integration tests with mocked Supabase/X/AI.
- Database/RLS tests against local Supabase where feasible.
- Playwright smoke tests.
- Publishing dry-run and idempotency tests.
- Design-system visual regression checks where feasible.
- Accessibility checks.

## Unit Tests

### Scoring

Test:

- Null metrics.
- Zero impressions.
- Impressions-based rates.
- Raw engagement fallback.
- Virality score.
- Recency decay.
- Velocity between snapshots.
- Buckets for post length/performance.
- Aggregations by topic/format/day/hour.

### Import Parsing

Test CSV/JSON/manual:

- Valid rows.
- Missing optional metrics.
- Malformed rows.
- Duplicate platform ids.
- Long text.
- Non-negative metrics.
- Archive-like input.

### AI Schemas

Test:

- Algo analysis exactly 9 metrics.
- Blog draft required fields.
- Coach citations exist.
- Invalid JSON repair.
- Unsupported confidence label rejected.
- Publishing risk review cannot approve.

### Publishing State Machine

Test:

- Draft cannot schedule before approval.
- Edit invalidates approval.
- Approved draft can schedule.
- Dry run never calls X.
- Idempotency prevents duplicate publish.
- Failed retry only when retryable.
- Partial thread failure preserves published ids.

## Integration Tests

- Auth allowlist.
- RLS cross-user denial.
- X OAuth token encryption/decryption mock.
- X sync with mocked posts/metrics.
- X create post dry/run publish mock.
- Media upload capability failure.
- Personal save token create/use/revoke.
- Data export excludes secrets.

## Playwright Smoke Tests

- Private access flow.
- Dashboard loads.
- Import post.
- View/edit post history.
- Generate voice profile with mocked AI.
- Create post draft.
- Analyze draft.
- Approve draft.
- Schedule draft.
- Cron publish dry-run/mocked publish.
- Failed publishing job visible.
- Create blog, export Markdown.
- Repurpose blog into X thread draft.
- Create campaign.
- Create experiment and record result.
- Coach question with evidence.
- Save inspiration through web app.
- Save inspiration through personal token endpoint.

## Design Regression

- Snapshot core screens in dark and light.
- Check paper grain layer exists.
- Check no rounded-full/pill buttons except allowed elements.
- Check no pure black/white colors in CSS output.
- Check focus visible states.
- Check reduced motion disables count-ups/sweeps.

## Accessibility

- Keyboard navigation.
- Command palette focus trap.
- Dialog/sheet aria.
- Table headers.
- Color contrast.
- Status text not color-only.

## Acceptance Criteria

- Typecheck passes.
- Lint passes.
- Unit tests pass.
- Core integration tests pass.
- Playwright smoke tests pass with mocked AI/X.
- Publishing dry-run tests prove no accidental external writes.
