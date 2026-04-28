import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

const auditMock = vi.hoisted(() => ({
  logAuditEvent: vi.fn(async () => ({ ok: true as const })),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/audit", () => auditMock);

import { BlogDetailView } from "@/components/blogs";
import { blogCreateSchema, blogExportSchema, blogUpdateSchema } from "@/lib/blogs/validation";
import { createBlog, exportBlog, generateBlogDraft, repurposeBlogToX, updateBlog } from "@/lib/blogs";
import { generatedOutputCreateSchema } from "@/lib/content/validation";
import { createMockAiProvider } from "@/lib/ai/providers/mock";
import type { AdminContext } from "@/lib/auth/admin";

type TableRow = Record<string, unknown>;
type SelectFilter = { key: string; op: "eq" | "is"; value: unknown };

const now = "2026-04-28T12:00:00.000Z";

function orderedRows(input: TableRow[], key: string | null, ascending: boolean) {
  if (!key) return [...input];
  return [...input].sort((left, right) => {
    const a = left[key];
    const b = right[key];
    if (a === b) return 0;
    return (a ?? "") > (b ?? "") ? (ascending ? 1 : -1) : ascending ? -1 : 1;
  });
}

function createSupabaseMock(seedRows: Record<string, TableRow[]> = {}) {
  const inserts: Record<string, TableRow[]> = {};
  const rows: Record<string, TableRow[]> = Object.fromEntries(Object.entries(seedRows).map(([table, seeded]) => [table, seeded.map((row) => ({ ...row }))]));
  const updates: Record<string, TableRow[]> = {};
  let idSequence = 0;

  function rowFor(table: string, payload: TableRow) {
    idSequence += 1;
    return {
      created_at: now,
      deleted_at: null,
      id: typeof payload.id === "string" ? payload.id : `${table}-${idSequence}`,
      metadata: {},
      updated_at: now,
      ...payload,
    };
  }

  function filteredRows(table: string, filters: SelectFilter[]) {
    return (rows[table] ?? []).filter((row) => filters.every((filter) => row[filter.key] === filter.value));
  }

  function selectChain(table: string) {
    const filters: SelectFilter[] = [];
    let ascending = false;
    let orderKey: string | null = null;

    const chain = {
      eq(key: string, value: unknown) {
        filters.push({ key, op: "eq", value });
        return chain;
      },
      is(key: string, value: unknown) {
        filters.push({ key, op: "is", value });
        return chain;
      },
      limit(count: number) {
        const data = orderedRows(filteredRows(table, filters), orderKey, ascending).slice(0, count);
        return Promise.resolve({ data, error: null });
      },
      order(key: string, options?: { ascending?: boolean }) {
        orderKey = key;
        ascending = options?.ascending ?? true;
        return chain;
      },
      single() {
        const data = orderedRows(filteredRows(table, filters), orderKey, ascending)[0] ?? null;
        return Promise.resolve({ data, error: data ? null : { message: "not found" } });
      },
      then<TResult1 = { data: TableRow[]; error: null }, TResult2 = never>(
        onfulfilled?: ((value: { data: TableRow[]; error: null }) => TResult1 | PromiseLike<TResult1>) | null,
        onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
      ) {
        return Promise.resolve({ data: orderedRows(filteredRows(table, filters), orderKey, ascending), error: null }).then(onfulfilled, onrejected);
      },
    };

    return chain;
  }

  function updateChain(table: string, payload: TableRow) {
    const filters: SelectFilter[] = [];
    const chain = {
      eq(key: string, value: unknown) {
        filters.push({ key, op: "eq", value });
        return chain;
      },
      is(key: string, value: unknown) {
        filters.push({ key, op: "is", value });
        return chain;
      },
      select() {
        return {
          async single() {
            const existing = filteredRows(table, filters)[0] ?? null;
            if (!existing) return { data: null, error: { message: "not found" } };
            const updated = { ...existing, ...payload, updated_at: now };
            rows[table] = (rows[table] ?? []).map((row) => (row === existing ? updated : row));
            updates[table] = [...(updates[table] ?? []), { filters, payload }];
            return { data: updated, error: null };
          },
        };
      },
      then<TResult1 = { error: null }, TResult2 = never>(
        onfulfilled?: ((value: { error: null }) => TResult1 | PromiseLike<TResult1>) | null,
        onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
      ) {
        rows[table] = (rows[table] ?? []).map((row) => (filteredRows(table, filters).includes(row) ? { ...row, ...payload, updated_at: now } : row));
        updates[table] = [...(updates[table] ?? []), { filters, payload }];
        return Promise.resolve({ error: null }).then(onfulfilled, onrejected);
      },
    };

    return chain;
  }

  function nextBlogVersionNumber(blogId: unknown, userId: unknown) {
    const latest = (rows.blog_versions ?? [])
      .filter((row) => row.blog_post_id === blogId && row.user_id === userId)
      .reduce((max, row) => Math.max(max, typeof row.version_number === "number" ? row.version_number : 0), 0);

    return latest + 1;
  }

  function updateBlogWithVersion(args: TableRow) {
    const existing = (rows.blog_posts ?? []).find((row) => row.id === args.p_blog_id && row.user_id === args.p_user_id && row.deleted_at === null);
    if (!existing) return { data: null, error: { message: "not found" } };

    const payload = (args.p_payload ?? {}) as TableRow;
    const updated: TableRow = { ...existing, ...payload, updated_at: now };
    rows.blog_posts = (rows.blog_posts ?? []).map((row) => (row === existing ? updated : row));
    updates.blog_posts = [...(updates.blog_posts ?? []), { filters: [{ key: "id", op: "eq", value: args.p_blog_id }], payload }];

    if (args.p_create_version) {
      const versionPayload = {
        blog_post_id: updated.id,
        change_reason: args.p_change_reason ?? null,
        created_by: args.p_created_by ?? "owner",
        html: updated.html,
        json_doc: updated.json_doc,
        markdown: updated.markdown,
        metadata: args.p_metadata ?? {},
        model: args.p_model ?? null,
        prompt_version: args.p_prompt_version ?? null,
        provider: args.p_provider ?? null,
        title: updated.title,
        user_id: args.p_user_id,
        version_number: nextBlogVersionNumber(updated.id, args.p_user_id),
      };

      inserts.blog_versions = [...(inserts.blog_versions ?? []), versionPayload];
      rows.blog_versions = [...(rows.blog_versions ?? []), rowFor("blog_versions", versionPayload)];
    }

    return { data: updated, error: null };
  }

  return {
    inserts,
    rows,
    supabase: {
      from(table: string) {
        return {
          insert(payload: TableRow) {
            inserts[table] = [...(inserts[table] ?? []), payload];
            const row = rowFor(table, payload);
            rows[table] = [...(rows[table] ?? []), row];
            return {
              select() {
                return {
                  async single() {
                    return { data: row, error: null };
                  },
                };
              },
            };
          },
          select() {
            return selectChain(table);
          },
          update(payload: TableRow) {
            return updateChain(table, payload);
          },
        };
      },
      rpc(name: string, args: TableRow) {
        if (name === "creatoros_update_blog_with_version") {
          return Promise.resolve(updateBlogWithVersion(args));
        }

        return Promise.resolve({ data: null, error: { message: `unsupported rpc ${name}` } });
      },
    },
    updates,
  };
}

function createAdminContext(supabase: unknown): AdminContext {
  return {
    email: "owner@example.com",
    supabase,
    user: { id: "user-1" },
    userId: "user-1",
  } as AdminContext;
}

const blogDraftPayload = {
  canonical_summary: "A concise guide to quiet creator systems.",
  categories: ["craft"],
  markdown_body: "# Quiet Systems\n\nQuality improves when your workflow catches ideas before they cool.",
  meta_description: "A practical guide to creator systems that make quality easier to repeat.",
  originality_notes: ["Written from owner source material."],
  outline: ["The leak", "The operating layer", "The weekly review"],
  selected_title: "Quiet Systems for Better Content",
  seo_title: "Quiet Systems for Better Content",
  slug: "quiet-systems-better-content",
  source_evidence_notes: ["Source blog and owner notes only."],
  tags: ["systems", "writing"],
  title_options: ["Quiet Systems for Better Content"],
  x_post_series: [
    { rationale: "Single-post summary.", text: "Quality gets easier when your workflow catches ideas before they cool." },
    { rationale: "Second series post.", text: "The trick is making capture boring enough to repeat." },
  ],
  x_thread_version: {
    final_synthesis: "Make the useful loop quiet enough to keep.",
    root_hook: "Your best ideas are not missing. They are leaking.",
    thread_items: [
      { sequence_index: 0, text: "A good system catches the raw thought." },
      { sequence_index: 1, text: "A weekly review turns it into reusable material." },
    ],
  },
};

const blogToXPayload = {
  originality_notes: ["Repurposed from the owner blog."],
  posts: blogDraftPayload.x_post_series,
  thread: blogDraftPayload.x_thread_version,
};

afterEach(() => {
  vi.unstubAllEnvs();
  auditMock.logAuditEvent.mockClear();
});

describe("Phase 14 blog validation", () => {
  it("parses blog create, update, export, and generated-output blog source values", () => {
    expect(
      blogCreateSchema.parse({
        markdown: "# Draft\n\nA working long-form thought.",
        source_id: "550e8400-e29b-41d4-a716-446655440000",
        source_type: "brain_dump",
        tags: "systems, craft",
        title: "  Quiet Systems  ",
      }),
    ).toMatchObject({ sourceId: "550e8400-e29b-41d4-a716-446655440000", sourceType: "brain_dump", tags: ["systems", "craft"], title: "Quiet Systems" });

    expect(
      blogUpdateSchema.parse({
        id: "blog-1",
        markdown: "# Updated\n\nMore complete now.",
        status: "editing",
        tags: "systems",
      }),
    ).toMatchObject({ id: "blog-1", status: "editing", tags: ["systems"] });

    expect(blogExportSchema.parse({ format: "mdx" })).toMatchObject({ format: "mdx" });
    expect(
      generatedOutputCreateSchema.safeParse({
        input_id: "550e8400-e29b-41d4-a716-446655440001",
        input_type: "blog_post",
        saved: true,
        text: "Repurposed post",
        type: "x_post",
      }).success,
    ).toBe(true);
  });
});

describe("Phase 14 blog services", () => {
  it("creates, updates, versions, and safely exports a blog", async () => {
    const { inserts, supabase, updates } = createSupabaseMock();
    const admin = createAdminContext(supabase);

    const blog = await createBlog(admin, {
      canonicalSummary: null,
      categories: ["craft"],
      markdown: "# Quiet Systems\n\nGood systems make quality repeatable.",
      metaDescription: null,
      metadata: {},
      seoTitle: null,
      slug: null,
      sourceId: null,
      sourceType: "manual",
      status: "idea",
      tags: ["systems"],
      title: "Quiet Systems",
    });

    expect(blog.slug).toBe("quiet-systems");
    expect(blog.wordCount).toBeGreaterThan(5);
    expect(inserts.blog_versions?.[0]).toMatchObject({ blog_post_id: blog.id, created_by: "owner", version_number: 1 });

    const updated = await updateBlog(admin, {
      changeReason: "Owner expanded the draft.",
      id: blog.id,
      markdown: "# Quiet Systems\n\n<script>alert('x')</script>\n\nGood systems make quality repeatable for a working creator.",
      status: "editing",
    });

    expect(updated.status).toBe("editing");
    expect(inserts.blog_versions?.[1]).toMatchObject({ blog_post_id: blog.id, change_reason: "Owner expanded the draft.", version_number: 2 });

    const exported = await exportBlog(admin, { blogId: blog.id, format: "html" });

    expect(exported.contentType).toBe("text/html; charset=utf-8");
    expect(exported.payload).toContain("&lt;script&gt;alert(&#39;x&#39;)&lt;/script&gt;");
    expect(exported.payload).not.toContain("<script>alert");
    expect(inserts.blog_exports?.[0]).toMatchObject({ blog_post_id: blog.id, format: "html", user_id: "user-1" });
    expect(updates.blog_posts?.at(-1)?.payload).toMatchObject({ status: "exported" });
    expect(auditMock.logAuditEvent).toHaveBeenCalledWith(expect.objectContaining({ eventType: "blog_exported" }));
  });

  it("generates a full AI draft and stores blog-to-X outputs as generated outputs only", async () => {
    vi.stubEnv("AI_PROVIDER", "mock");
    vi.stubEnv("AI_MODEL", "mock-model");
    const { inserts, supabase, updates } = createSupabaseMock({
      blog_posts: [
        {
          canonical_summary: null,
          categories: [],
          created_at: now,
          deleted_at: null,
          excerpt: null,
          html: null,
          id: "blog-1",
          json_doc: {},
          markdown: "Seed thesis about quiet systems.",
          meta_description: null,
          metadata: {},
          reading_time_minutes: 0,
          seo_title: null,
          slug: "quiet-systems",
          source_id: null,
          source_type: "manual",
          status: "idea",
          tags: [],
          title: "Quiet Systems",
          updated_at: now,
          user_id: "user-1",
          word_count: 4,
        },
      ],
    });
    const admin = createAdminContext(supabase);

    const draft = await generateBlogDraft(admin, {
      blogId: "blog-1",
      ownerNotes: "Use the owner voice and turn this into a full essay.",
      provider: createMockAiProvider({ responses: [{ content: JSON.stringify(blogDraftPayload) }] }),
    });

    expect(draft.blog.title).toBe("Quiet Systems for Better Content");
    expect(draft.blog.seoTitle).toBe("Quiet Systems for Better Content");
    expect(draft.blog.markdown).toContain("Quality improves");
    expect(inserts.blog_versions?.at(-1)).toMatchObject({ blog_post_id: "blog-1", created_by: "ai", prompt_version: "blog-draft.v1" });

    const outputs = await repurposeBlogToX(admin, {
      blogId: "blog-1",
      provider: createMockAiProvider({ responses: [{ content: JSON.stringify(blogToXPayload) }] }),
    });

    expect(outputs.generatedOutputs.map((output) => output.type)).toEqual(["x_thread", "x_post", "x_post"]);
    expect(inserts.generated_outputs).toHaveLength(3);
    expect(inserts.generated_outputs?.[0]).toMatchObject({ input_id: "blog-1", input_type: "blog_post", saved: true, type: "x_thread" });
    expect(inserts.blog_repurposing_jobs?.[0]).toMatchObject({ blog_post_id: "blog-1", direction: "blog_to_x", status: "running" });
    expect(updates.blog_repurposing_jobs?.at(-1)?.payload).toMatchObject({ output_generated_output_ids: outputs.generatedOutputs.map((output) => output.id), status: "succeeded" });
    expect(JSON.stringify(inserts)).not.toContain("publishing_drafts");
  });
});

describe("Phase 14 blog UI", () => {
  it("renders the blog editor, metadata, versions, exports, and repurposing controls without publishing actions", () => {
    const markup = renderToStaticMarkup(
      React.createElement(BlogDetailView, {
        aiEditorAction: async () => {},
        exportActionBase: "/api/blogs/blog-1/export",
        generateDraftAction: async () => {},
        generateOutlineAction: async () => {},
        generateSeoAction: async () => {},
        repurposeAction: async () => {},
        updateAction: async () => {},
        detail: {
          blog: {
            canonicalSummary: "A practical operating note.",
            categories: ["craft"],
            createdAt: now,
            excerpt: "Good systems make quality repeatable.",
            exportCount: 1,
            html: "<h1>Quiet Systems</h1>",
            id: "blog-1",
            markdown: "# Quiet Systems\n\nGood systems make quality repeatable.",
            metaDescription: "Creator workflow guide.",
            metadata: {},
            readingTimeMinutes: 1,
            seoTitle: "Quiet Systems",
            slug: "quiet-systems",
            sourceId: null,
            sourceType: "manual",
            status: "editing",
            tags: ["systems"],
            title: "Quiet Systems",
            updatedAt: now,
            wordCount: 7,
          },
          exports: [
            {
              checksum: "abc123",
              createdAt: now,
              exportedAt: now,
              format: "markdown",
              id: "export-1",
              payload: "# Quiet Systems",
            },
          ],
          versions: [
            {
              changeReason: "Initial draft",
              createdAt: now,
              createdBy: "owner",
              id: "version-1",
              model: null,
              promptVersion: null,
              provider: null,
              versionNumber: 1,
            },
          ],
        },
        notice: "blog_updated",
      }),
    );

    expect(markup).toContain("Blog editor");
    expect(markup).toContain("Metadata");
    expect(markup).toContain("Version timeline");
    expect(markup).toContain("Export panel");
    expect(markup).toContain("Repurpose to X");
    expect(markup).toContain("Generate full draft");
    expect(markup).not.toContain("Publish blog");
    expect(markup).not.toContain("Approve publishing");
  });
});
