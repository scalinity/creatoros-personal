# docs/AI_SYSTEM.md

## AI Provider Defaults

Default environment:

- `AI_PROVIDER=anthropic`
- `AI_MODEL=claude-opus-4-7`
- `AI_THINKING_TYPE=adaptive`
- `AI_EFFORT=max`
- `AI_MAX_TOKENS=64000`
- `AI_EMBEDDING_MODEL=text-embedding-3-small` or another configured model with matching vector dimension.

Anthropic’s current docs identify Claude Opus 4.7 as the most capable generally available model for complex reasoning and agentic coding, and document adaptive thinking as the supported Opus 4.7 thinking mode. The implementation must use `thinking: { type: "adaptive" }` and `output_config: { effort: "max" }` for high-quality workflows. Do not use legacy `budget_tokens` as the primary control path for Opus 4.7.

## Provider Abstraction

Interface capabilities:

- `generateText(request)`
- `generateStructured(request, zodSchema)`
- `streamText(request)`
- `embed(request)`
- `estimateCost(usage)`

Providers:

- `anthropic` default.
- `openai` optional.
- `mock` for tests.

Normalized response fields:

- `provider`
- `model`
- `content`
- `structured`
- `usage.input_tokens`
- `usage.output_tokens`
- `usage.total_tokens`
- `estimated_cost_usd`
- `latency_ms`
- `finish_reason`
- `raw_metadata_redacted`

## Model Routing

Quality-first default routes to Opus 4.7 max effort:

- Coach synthesis.
- Growth strategy.
- Blog writing/editing.
- Account research.
- Voice profile.
- Publishing risk review.
- Complex content campaigns.

Cheaper/faster configurable routes may use lower-cost models later:

- Categorization.
- Tag suggestions.
- Import cleanup.
- Title variants.
- Basic rewrites.
- Embedding generation.

Routing is config-driven; never hardcode alternate models into prompts.

## Structured Output

Every AI module must define a Zod schema and validate output.

Use provider-native structured output where available:

- Anthropic structured outputs via `output_config.format` or strict tool use.
- OpenAI structured outputs via JSON Schema where configured.

Pipeline:

1. Build prompt from registry.
2. Call provider.
3. Parse JSON.
4. Repair syntax once if needed.
5. Validate Zod.
6. Verify internal citations point to allowed records.
7. Persist `prompt_runs` and domain artifact.

## Prompt Runs and Jobs

`ai_jobs` tracks status. `prompt_runs` tracks execution metadata.

Do not store:

- AI provider keys.
- X tokens.
- Supabase service role key.
- Full external authorization headers.
- Hidden system prompts if they include secrets.

Store:

- Prompt name/version.
- Input hash.
- Redacted input summary.
- Redacted structured output summary.
- Token usage.
- Estimated cost if available.
- Validation status.

## AI Modules

| Module | Output |
|---|---|
| Content Coach | Evidence-cited answer, diagnosis, recommendations, drafts, confidence labels. |
| Algorithm Analyzer | 9 heuristic metric scores, rewrites, publish readiness, risk warnings. |
| Post Writer | Single posts, variants, campaign sequences. |
| Thread Writer | Ordered thread items with continuation logic and final post. |
| Reply Writer | Approved-only reply drafts, risk notes. |
| Quote-Post Writer | Quote drafts with target context and risk warnings. |
| Blog Writer | Ideas, outlines, full drafts, summaries, SEO metadata. |
| Blog Editor | Rewrite/expand/compress/clarify/structure long-form content. |
| SEO Assistant | Slug, title, meta description, headings, canonical summary. |
| Brain Dump Transformer | Posts, threads, blogs, scripts, campaigns, questions. |
| Account Researcher | Patterns, pillars, audience hypotheses, ethical learnings, ideas. |
| Inspiration Transformer | Abstract structure, original variants, plagiarism risk. |
| Voice Modeler | Owner voice profile from owner posts/blogs only. |
| History Analyzer | Playbooks, repurposing suggestions, category analysis. |
| Growth Strategist | Goals, cadence, campaigns, experiments, reviews. |
| Experiment Analyst | Result interpretation and decision recommendation. |
| Profile Auditor | Bio/header/pinned post/profile review. |

## Confidence Labels

- `FACT`: Directly supported by internal record or metric.
- `INFERENCE`: Reasoned from internal evidence, not directly measured.
- `SPECULATION`: Hypothesis or strategic guess.

Coach, growth, account research, and analytics narratives must label claims.

## Retrieval

Sources:

- Posts and metric snapshots.
- Publishing drafts/jobs/published posts.
- Content ideas.
- Generated outputs.
- Brain dumps.
- Blog posts/versions/exports.
- Inspiration posts.
- Target accounts/posts.
- Reports.
- Campaigns/experiments/reviews.
- Voice profile.

Retrieval modes:

- Vector via pgvector when embeddings exist.
- Keyword full-text fallback.
- Deterministic metric aggregates.
- Recency/campaign/experiment filters.

Every evidence item returned to the AI includes `record_type`, `record_id`, `snippet`, `metrics`, `timestamp`, and `confidence`.

## Rate Limits

Suggested defaults:

- Coach: 30/day.
- Algo Analyzer: 50/day.
- Blog Writer: 20/day.
- Account Research: 20/day.
- Growth Review: 10/day.
- Voice Profile: 5/day.
- Publishing Risk Review: 100/day.
- Embeddings: 10 refresh jobs/day.

## Failure Modes

| Failure | Handling |
|---|---|
| Missing Anthropic key | Disable AI routes; diagnostics show missing provider key. |
| Opus 4.7 rejects legacy parameters | Implementation test fails; use adaptive thinking and output_config effort. |
| Invalid JSON | Repair once, validate, fail if still invalid. |
| Hallucinated citations | Reject or strip unsupported claim before persistence. |
| Similarity risk high | Block direct approval until owner reviews. |
| Provider timeout | Mark job failed, preserve source draft. |


## Verified Official References

The implementation should verify against these official references during build because API details can change:

- Anthropic model overview: https://platform.claude.com/docs/en/about-claude/models/overview
- Anthropic adaptive thinking: https://platform.claude.com/docs/en/build-with-claude/adaptive-thinking
- Anthropic Opus 4.7 migration guide: https://platform.claude.com/docs/en/about-claude/models/migration-guide
- Anthropic structured outputs: https://platform.claude.com/docs/en/build-with-claude/structured-outputs
- X OAuth 2.0 Authorization Code with PKCE: https://docs.x.com/fundamentals/authentication/oauth-2-0/authorization-code
- X create/edit post endpoint: https://docs.x.com/x-api/posts/create-post
- X delete post endpoint: https://docs.x.com/x-api/posts/delete-post
- X media introduction: https://docs.x.com/x-api/media/introduction
- X metrics: https://docs.x.com/x-api/fundamentals/metrics
- X fields and expansions: https://docs.x.com/x-api/fundamentals/fields
- X developer guidelines: https://docs.x.com/developer-guidelines
- Supabase Row Level Security: https://supabase.com/docs/guides/database/postgres/row-level-security
- Supabase pgvector: https://supabase.com/docs/guides/database/extensions/pgvector
- Next.js Route Handlers: https://nextjs.org/docs/app/getting-started/route-handlers
- Vercel Cron Jobs: https://vercel.com/docs/cron-jobs/manage-cron-jobs
