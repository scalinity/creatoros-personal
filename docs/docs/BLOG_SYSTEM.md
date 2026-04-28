# docs/BLOG_SYSTEM.md

## Purpose

The Blog System is core product scope. It transforms X history, brain dumps, account research, inspiration, and campaign strategy into long-form drafts and exportable writing assets.

## Status Workflow

- `idea`
- `outlining`
- `drafting`
- `editing`
- `ready`
- `exported`
- `published_externally`
- `archived`

## Inputs

- Blank manual draft.
- Content idea.
- X post or thread.
- Brain dump.
- Saved inspiration.
- Account research report.
- Campaign brief.
- Experiment result.
- Coach recommendation.

## AI Features

- Blog idea generation.
- Outline generation.
- Full blog drafting.
- Blog editing.
- SEO title generation.
- Meta description generation.
- Slug generation.
- Tags/categories.
- Canonical summary.
- Blog-to-X thread.
- Blog-to-X post series.
- X-to-blog expansion.
- Brain-dump-to-blog.
- Inspiration-to-blog with plagiarism guard.
- Account-research-to-blog.

## Blog Editor

Editor stores:

- Markdown body.
- Optional HTML render.
- JSON document model.
- Versions.
- Source links.
- SEO metadata.
- Export artifacts.

Design:

- Fraunces title.
- Public Sans editor body with long-form leading.
- Metadata inspector uses KeyValueRows.
- Version timeline uses dense Table.

## Exports

Supported:

- Markdown.
- HTML.
- JSON.
- MDX-ready export.

Future adapters behind interface:

- Personal website.
- Ghost.
- WordPress.
- MDX static site.

Adapters are not required for initial implementation, but the export system must make them easy to add.

## Repurposing

Blog-to-X outputs:

- Canonical X thread.
- Short single-post summary.
- 5-10 post series.
- Quote-ready excerpts.
- Campaign sequence.

X-to-blog outputs:

- Expanded argument.
- Outline.
- Full draft.
- Related post references.

## Plagiarism/Originality

When source is inspiration or target account research:

- Extract abstract structure.
- Do not preserve distinctive phrasing.
- Run similarity check.
- Store originality notes.
- Block ready/publish workflow on high similarity until owner revises.

## Acceptance Criteria

- Owner can create, edit, version, and export blogs.
- AI can draft full long-form blog posts.
- Blog can repurpose to X publishing drafts.
- X posts/threads can expand into blog drafts.
- Export artifacts are stored and downloadable.
