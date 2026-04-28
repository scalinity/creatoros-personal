import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

const auditMock = vi.hoisted(() => ({
  logAuditEvent: vi.fn(async () => ({ ok: true as const })),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/audit", () => auditMock);

import { createMockAiProvider } from "@/lib/ai/providers/mock";
import { brainDumpOutputSchema } from "@/lib/ai/schemas";
import { runAlgoAnalysis, saveAnalyzerRewriteAsIdea, saveAnalyzerRewriteAsOutput } from "@/lib/algo-analyzer";
import { algoAnalyzerInputSchema } from "@/lib/algo-analyzer/validation";
import { saveBrainDumpGeneratedOutput, transformBrainDump } from "@/lib/brain-dumps";
import { brainDumpInputSchema, brainDumpSaveOutputSchema } from "@/lib/brain-dumps/validation";
import { generatedOutputCreateSchema } from "@/lib/content/validation";
import { AlgoAnalyzerView } from "@/components/analyzer";
import { BrainDumpWorkspaceView } from "@/components/brain-dump";
import type { AdminContext } from "@/lib/auth/admin";

type TableInsert = Record<string, unknown>;

type SelectFilter = {
  key: string;
  op: "eq" | "is";
  value: unknown;
};

function createSupabaseMock(seedRows: Record<string, TableInsert[]> = {}) {
  const inserts: Record<string, TableInsert[]> = {};
  const rows: Record<string, TableInsert[]> = Object.fromEntries(Object.entries(seedRows).map(([table, seeded]) => [table, [...seeded]]));
  const updates: Record<string, TableInsert[]> = {};
  let idSequence = 0;

  function rowFor(table: string, payload: TableInsert) {
    idSequence += 1;
    return {
      created_at: "2026-04-28T12:00:00.000Z",
      deleted_at: null,
      id: typeof payload.id === "string" ? payload.id : `${table}-${idSequence}`,
      updated_at: "2026-04-28T12:00:00.000Z",
      ...payload,
    };
  }

  function filteredRows(table: string, filters: SelectFilter[]) {
    return (rows[table] ?? []).filter((row) =>
      filters.every((filter) => {
        if (filter.op === "eq") return row[filter.key] === filter.value;
        return row[filter.key] === filter.value;
      }),
    );
  }

  function selectChain(table: string) {
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
      limit(count: number) {
        return Promise.resolve({ data: filteredRows(table, filters).slice(0, count), error: null });
      },
      order() {
        return chain;
      },
      single() {
        const data = filteredRows(table, filters)[0] ?? null;
        return Promise.resolve({ data, error: data ? null : { message: "not found" } });
      },
      then<TResult1 = { data: TableInsert[]; error: null }, TResult2 = never>(
        onfulfilled?: ((value: { data: TableInsert[]; error: null }) => TResult1 | PromiseLike<TResult1>) | null,
        onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
      ) {
        return Promise.resolve({ data: filteredRows(table, filters), error: null }).then(onfulfilled, onrejected);
      },
    };

    return chain;
  }

  return {
    inserts,
    rows,
    supabase: {
      from(table: string) {
        return {
          insert(payload: TableInsert) {
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
          update(payload: TableInsert) {
            updates[table] = [...(updates[table] ?? []), payload];
            const chain = {
              eq: vi.fn(() => chain),
              then<TResult1 = { error: null }, TResult2 = never>(
                onfulfilled?: ((value: { error: null }) => TResult1 | PromiseLike<TResult1>) | null,
                onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
              ) {
                return Promise.resolve({ error: null }).then(onfulfilled, onrejected);
              },
            };
            return chain;
          },
        };
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

const algoProvider = createMockAiProvider({
  responses: [
    {
      content: JSON.stringify({
        confidence_label: "inference",
        heuristic_disclaimer: "This is a heuristic evaluation, not the official X algorithm.",
        highest_leverage_improvement: "Make the payoff concrete in line one.",
        metric_scores: {
          algorithm_hygiene_risk: 9,
          clarity: 8,
          emotional_pull: 7,
          format_suitability: 8,
          hook_strength: 9,
          novelty: 7,
          readability_compression: 8,
          reply_engagement_potential: 6,
          specificity: 8,
        },
        overall_score: 82,
        publish_readiness: "revise",
        risk_warnings: ["Heuristic score only; owner review required."],
        rewrites: [
          {
            rationale: "Lead with contrast.",
            text: "Your system should make good taste easier to repeat.",
          },
        ],
        thread_expansion: ["Show the old workflow.", "Show the quieter replacement."],
        weaknesses: ["The original opener is abstract."],
      }),
      usage: { input_tokens: 20, output_tokens: 30, total_tokens: 50 },
    },
  ],
});

const brainDumpPayload = {
  blog_outlines: [
    {
      rationale: "Turns the core thesis into an essay.",
      sections: ["The memory tax", "The operating layer", "The weekly loop"],
      thesis: "Creator quality improves when repeatable systems carry the boring work.",
      title: "The Quiet Operating System Behind Better Content",
    },
  ],
  campaign_angles: ["Systems as taste"],
  campaign_ideas: [
    {
      angle: "Show one workflow leak per day.",
      name: "Quiet Systems Week",
      rationale: "A repeatable series makes the thesis memorable.",
      sequence: ["Capture", "Score", "Rewrite", "Ship"],
    },
  ],
  contradictions: ["I want spontaneity, but I rely on rigid capture."],
  extracted_claims: ["Quality should not require heroic memory."],
  extracted_examples: ["The draft inbox prevents good hooks from vanishing."],
  extracted_stories: ["A messy note became a week of posts."],
  extracted_themes: ["workflow", "taste", "memory"],
  longform_angles: ["A field guide to personal creator systems"],
  questions: ["Where does the current process leak quality?"],
  strategy: {
    content_pillars: ["systems", "craft"],
    next_actions: ["Turn the strongest claim into a post", "Expand the story into a blog outline"],
    positioning: "Practical systems for thoughtful creators.",
  },
  strong_lines: ["Quality should not require heroic memory."],
  video_scripts: [
    {
      beats: ["Name the leak", "Show the capture fix", "Close with the payoff"],
      cta: "Save one idea before it cools.",
      hook: "Your best ideas are not missing. They are leaking.",
      title: "Stop Losing Good Hooks",
    },
  ],
  x_posts: [
    {
      rationale: "Standalone thesis.",
      text: "Quality should not require heroic memory. Build the small system that catches the idea before it cools.",
    },
  ],
  x_threads: [
    {
      hook: "The better creator system is usually quieter.",
      items: ["Capture everything", "Score it later", "Rewrite the useful parts"],
    },
  ],
};

function brainDumpPayloadJson() {
  return JSON.stringify(brainDumpPayload);
}

function createBrainDumpProvider() {
  return createMockAiProvider({ responses: [{ content: brainDumpPayloadJson() }] });
}

afterEach(() => {
  vi.unstubAllEnvs();
  auditMock.logAuditEvent.mockClear();
});

describe("Phase 12 AI workflow validation", () => {
  it("validates analyzer and brain-dump form inputs plus new generated-output source types", () => {
    expect(
      algoAnalyzerInputSchema.parse({
        content_type: "post",
        draft_text: "  This is a draft with a sharper point than the old one. ",
        generate_thread: "true",
        include_publish_readiness: "true",
        use_voice_profile: "on",
      }),
    ).toMatchObject({
      contentType: "post",
      draftText: "This is a draft with a sharper point than the old one.",
      generateThread: true,
      includePublishReadiness: true,
      useVoiceProfile: true,
    });

    expect(
      brainDumpInputSchema.parse({
        raw_text: "A long messy note about systems, memory, drafts, and repeatable quality. It has enough substance.",
        title: "  Systems note ",
      }),
    ).toMatchObject({ rawText: expect.stringContaining("systems"), title: "Systems note" });

    expect(
      brainDumpSaveOutputSchema.parse({
        brain_dump_id: "550e8400-e29b-41d4-a716-446655440000",
        item_index: "2",
        section: "x_post",
      }),
    ).toMatchObject({ brainDumpId: "550e8400-e29b-41d4-a716-446655440000", itemIndex: 2, section: "x_post" });

    expect(
      generatedOutputCreateSchema.safeParse({
        input_id: "550e8400-e29b-41d4-a716-446655440000",
        input_type: "algo_analysis_report",
        text: "Saved rewrite",
        type: "x_post",
      }).success,
    ).toBe(true);

    expect(
      generatedOutputCreateSchema.safeParse({
        input_id: "550e8400-e29b-41d4-a716-446655440001",
        input_type: "brain_dump",
        text: "Saved script",
        type: "video_script",
      }).success,
    ).toBe(true);
  });

  it("requires Phase 12 brain-dump structured outputs for outlines, scripts, campaigns, and strategy", () => {
    const result = brainDumpOutputSchema.safeParse(brainDumpPayload);

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.data.blog_outlines[0]?.sections).toContain("The operating layer");
    expect(result.data.video_scripts[0]?.hook).toContain("ideas");
    expect(result.data.campaign_ideas[0]?.sequence).toContain("Ship");
    expect(result.data.strategy.next_actions).toHaveLength(2);
  });

  it("rejects incomplete brain-dump packs", () => {
    expect(brainDumpOutputSchema.safeParse({ ...brainDumpPayload, x_posts: [] }).success).toBe(false);
    expect(
      brainDumpOutputSchema.safeParse({
        ...brainDumpPayload,
        strategy: { ...brainDumpPayload.strategy, next_actions: [] },
      }).success,
    ).toBe(false);
  });
});

describe("Phase 12 workflow services", () => {
  it("runs structured algorithm analysis and persists a report with prompt run records", async () => {
    vi.stubEnv("AI_PROVIDER", "mock");
    vi.stubEnv("AI_MODEL", "mock-model");
    const { inserts, supabase } = createSupabaseMock();
    const admin = createAdminContext(supabase);

    const report = await runAlgoAnalysis(
      admin,
      {
        contentType: "post",
        draftText: "A system is only useful if it makes good work easier to repeat.",
        generateThread: true,
        includePublishReadiness: true,
        useVoiceProfile: true,
      },
      { provider: algoProvider },
    );

    expect(report.overallScore).toBe(82);
    expect(report.metricScores.hook_strength).toBe(9);
    expect(report.diagnosis.heuristicDisclaimer).toBe("This is a heuristic evaluation, not the official X algorithm.");
    expect(report.rewrites[0]?.text).toContain("good taste");
    expect(inserts.ai_jobs).toHaveLength(1);
    expect(inserts.prompt_runs).toHaveLength(1);
    expect(inserts.algo_analysis_reports?.[0]).toMatchObject({
      content_type: "post",
      confidence_label: "inference",
      overall_score: 82,
      user_id: "user-1",
    });

    await saveAnalyzerRewriteAsOutput(admin, {
      reportId: report.id,
      rewriteIndex: 0,
      text: "FORGED HIDDEN FORM TEXT",
      type: "manual",
    } as never);

    expect(inserts.generated_outputs?.[0]).toMatchObject({
      input_id: report.id,
      input_type: "algo_analysis_report",
      text: "Your system should make good taste easier to repeat.",
      type: "x_post",
      user_id: "user-1",
    });
    expect(inserts.generated_outputs?.[0]?.metadata).toMatchObject({ rewrite_index: 0, source: "algo_analyzer" });

    await saveAnalyzerRewriteAsIdea(admin, {
      reportId: report.id,
      rewriteIndex: 0,
      tags: "systems, taste",
      title: "Saved analyzer idea",
    });

    expect(inserts.content_ideas?.[0]).toMatchObject({
      raw_text: "Your system should make good taste easier to repeat.",
      source: "algo_analyzer",
      source_entity_id: report.id,
      source_entity_type: "algo_analysis_report",
      title: "Saved analyzer idea",
      user_id: "user-1",
    });
  });

  it("maps saved analyzer rewrites by persisted content type", async () => {
    const reportId = "550e8400-e29b-41d4-a716-446655440123";
    const { inserts, supabase } = createSupabaseMock({
      algo_analysis_reports: [
        {
          confidence_label: "inference",
          content_type: "reply",
          created_at: "2026-04-28T12:00:00.000Z",
          deleted_at: null,
          diagnosis: {
            heuristic_disclaimer: "This is a heuristic evaluation, not the official X algorithm.",
            highest_leverage_improvement: "Answer the implied objection.",
            weaknesses: [],
          },
          draft_text: "Original reply draft",
          id: reportId,
          metric_scores: {
            algorithm_hygiene_risk: 8,
            clarity: 8,
            emotional_pull: 7,
            format_suitability: 8,
            hook_strength: 7,
            novelty: 7,
            readability_compression: 8,
            reply_engagement_potential: 9,
            specificity: 8,
          },
          model: "mock-model",
          overall_score: 80,
          prompt_version: "algo-analysis.v1",
          provider: "mock",
          publish_readiness: { notes: [], status: "revise" },
          rewrites: [{ rationale: "Make it conversational.", text: "Stored reply rewrite." }],
          risk_warnings: [],
          thread_expansion: [],
          updated_at: "2026-04-28T12:00:00.000Z",
          user_id: "user-1",
          voice_profile_id: null,
        },
      ],
    });
    const admin = createAdminContext(supabase);

    await saveAnalyzerRewriteAsOutput(admin, {
      reportId,
      rewriteIndex: 0,
      text: "FORGED POST TEXT",
      type: "x_post",
    } as never);

    expect(inserts.generated_outputs?.[0]).toMatchObject({
      input_id: reportId,
      text: "Stored reply rewrite.",
      type: "reply",
    });
  });

  it("transforms and persists a brain dump with generated content pack", async () => {
    vi.stubEnv("AI_PROVIDER", "mock");
    vi.stubEnv("AI_MODEL", "mock-model");
    const { inserts, supabase } = createSupabaseMock();
    const admin = createAdminContext(supabase);

    const brainDump = await transformBrainDump(
      admin,
      {
        rawText: "A long messy note about systems, memory, drafts, and repeatable quality. It has enough substance.",
        title: "Systems note",
      },
      { provider: createBrainDumpProvider() },
    );

    expect(brainDump.extractedThemes).toContain("workflow");
    expect(brainDump.generatedPack.blog_outlines[0]?.title).toContain("Quiet Operating System");
    expect(brainDump.generatedPack.video_scripts[0]?.hook).toContain("leaking");
    expect(brainDump.generatedPack.campaign_ideas[0]?.name).toBe("Quiet Systems Week");
    expect(inserts.brain_dumps?.[0]).toMatchObject({
      raw_text: expect.stringContaining("systems"),
      title: "Systems note",
      user_id: "user-1",
    });
    expect(inserts.prompt_runs).toHaveLength(1);

    await saveBrainDumpGeneratedOutput(admin, {
      brainDumpId: brainDump.id,
      itemIndex: 0,
      section: "video_script",
      text: "FORGED SCRIPT",
      type: "manual",
    } as never);

    expect(inserts.generated_outputs?.[0]).toMatchObject({
      input_id: brainDump.id,
      input_type: "brain_dump",
      provider: "mock",
      text: expect.stringContaining("Stop Losing Good Hooks"),
      type: "video_script",
      user_id: "user-1",
    });
    expect(inserts.generated_outputs?.[0]?.metadata).toMatchObject({ item_index: 0, section: "video_script", source: "brain_dump" });
    expect(inserts.generated_outputs?.[0]?.text).not.toContain("FORGED");
  });
});

describe("Phase 12 workflow views", () => {
  it("renders the analyzer textarea, heuristic disclaimer, nine metric scores, rewrites, and save actions", () => {
    const markup = renderToStaticMarkup(
      React.createElement(AlgoAnalyzerView, {
        analyzeAction: async () => {},
        filters: {},
        report: {
          confidenceLabel: "inference",
          contentType: "post",
          createdAt: "2026-04-28T12:00:00.000Z",
          diagnosis: {
            heuristicDisclaimer: "This is a heuristic evaluation, not the official X algorithm.",
            highestLeverageImprovement: "Make the payoff concrete in line one.",
            weaknesses: ["The original opener is abstract."],
          },
          draftText: "Draft text",
          id: "report-1",
          metricScores: {
            algorithm_hygiene_risk: 9,
            clarity: 8,
            emotional_pull: 7,
            format_suitability: 8,
            hook_strength: 9,
            novelty: 7,
            readability_compression: 8,
            reply_engagement_potential: 6,
            specificity: 8,
          },
          model: "mock-model",
          overallScore: 82,
          promptVersion: "algo-analysis.v1",
          provider: "mock",
          publishReadiness: { notes: ["Owner review required."], status: "revise" },
          riskWarnings: ["Heuristic score only; owner review required."],
          rewrites: [{ rationale: "Lead with contrast.", text: "Your system should make taste easier to repeat." }],
          threadExpansion: ["Show the old workflow.", "Show the replacement."],
        },
        reports: [],
        saveIdeaAction: async () => {},
        saveOutputAction: async () => {},
      }),
    );

    expect(markup).toContain('id="algo-analyzer-title"');
    expect(markup).toContain("Algorithm analyzer");
    expect(markup).toContain("Heuristic analyzer");
    expect(markup).toContain("Draft textarea");
    expect(markup).toContain("hook strength");
    expect(markup).toContain("Your system should make taste");
    expect(markup).toContain("Save output");
    expect(markup).toContain("Save idea");
    expect(markup).not.toContain("official X algorithm access");
  });

  it("renders brain-dump capture, extraction, generated packs, clarifying questions, and save actions", () => {
    const markup = renderToStaticMarkup(
      React.createElement(BrainDumpWorkspaceView, {
        brainDump: {
          createdAt: "2026-04-28T12:00:00.000Z",
          extractedClaims: ["Quality should not require heroic memory."],
          extractedContradictions: ["Spontaneity needs capture."],
          extractedExamples: ["The draft inbox catches hooks."],
          extractedStories: ["A messy note became a week of posts."],
          extractedThemes: ["workflow"],
          generatedPack: brainDumpPayload,
          id: "brain-1",
          model: "mock-model",
          promptVersion: "brain-dump.v1",
          provider: "mock",
          rawText: "Messy note",
          strongLines: ["Quality should not require heroic memory."],
          title: "Systems note",
        },
        dumps: [],
        saveOutputAction: async () => {},
        transformAction: async () => {},
      }),
    );

    expect(markup).toContain('id="brain-dump-title"');
    expect(markup).toContain("Brain dump transformer");
    expect(markup).toContain("Raw dump");
    expect(markup).toContain("Themes");
    expect(markup).toContain("10 posts");
    expect(markup).toContain("Blog outlines");
    expect(markup).toContain("Video scripts");
    expect(markup).toContain("Clarifying questions");
    expect(markup).toContain("Save to composer");
    expect(markup).toContain('type="hidden" name="section" value="x_post"');
    expect(markup).toContain('type="hidden" name="item_index" value="0"');
    expect(markup).not.toContain('name="variants"');
    expect(markup).not.toContain('name="type" type="hidden"');
  });
});
