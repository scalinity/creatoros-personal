import "server-only";

import type { z } from "zod";

import { logAuditEvent } from "@/lib/audit";
import type { AdminContext } from "@/lib/auth/admin";
import { brainDumpOutputSchema, type AiProvider } from "@/lib/ai";
import { validateAiStructuredOutput } from "@/lib/ai/json";
import { runStructuredPrompt } from "@/lib/ai/run";
import { createGeneratedOutput } from "@/lib/content";
import type { GeneratedOutputCreateInput } from "@/lib/content/validation";
import type { BrainDumpRow, Json } from "@/types/database";

import type { BrainDumpInput, BrainDumpSaveOutputInput } from "./validation";

const PHASE = "12-algorithm-analyzer-brain-dump-transformer";
const PROMPT_ID = "brain-dump.v1";

export type BrainDumpGeneratedPack = z.infer<typeof brainDumpOutputSchema>;

export type BrainDumpRecord = {
  createdAt: string;
  extractedClaims: string[];
  extractedContradictions: string[];
  extractedExamples: string[];
  extractedStories: string[];
  extractedThemes: string[];
  generatedPack: BrainDumpGeneratedPack;
  // L-29: true when the stored generated_pack failed schema parse and we
  // returned the placeholder pack. UI should treat this as "regenerate me"
  // rather than rendering placeholder strings as real AI output.
  generatedPackParseFailed: boolean;
  id: string;
  model: null | string;
  promptVersion: null | string;
  provider: null | string;
  rawText: string;
  strongLines: string[];
  title: null | string;
};

export type BrainDumpWorkspace = {
  dumps: BrainDumpRecord[];
  selectedDump: BrainDumpRecord | null;
};

export type BrainDumpRunOptions = {
  provider?: AiProvider;
};

const emptyBrainDumpPack: BrainDumpGeneratedPack = {
  blog_outlines: [
    {
      rationale: "Stored generated pack could not be parsed.",
      sections: ["Review the original brain dump and regenerate."],
      thesis: "Stored generated pack could not be parsed.",
      title: "Unavailable generated pack",
    },
  ],
  campaign_angles: ["Stored generated pack could not be parsed."],
  campaign_ideas: [
    {
      angle: "Review and regenerate this brain dump.",
      name: "Unavailable campaign idea",
      rationale: "Stored generated pack could not be parsed.",
      sequence: ["Regenerate the brain dump."],
    },
  ],
  contradictions: [],
  extracted_claims: ["Stored generated pack could not be parsed."],
  extracted_examples: [],
  extracted_stories: [],
  extracted_themes: ["unavailable"],
  longform_angles: ["Stored generated pack could not be parsed."],
  questions: ["Should this brain dump be regenerated?"],
  strategy: {
    content_pillars: ["unavailable"],
    next_actions: ["Regenerate this brain dump."],
    positioning: "Stored generated pack could not be parsed.",
  },
  strong_lines: ["Stored generated pack could not be parsed."],
  video_scripts: [
    {
      beats: ["Regenerate this brain dump."],
      cta: "Review before saving.",
      hook: "Stored generated pack could not be parsed.",
      title: "Unavailable video script",
    },
  ],
  x_posts: [{ rationale: "Stored generated pack could not be parsed.", text: "Regenerate this brain dump before using generated content." }],
  x_threads: [{ hook: "Stored generated pack could not be parsed.", items: ["Regenerate this brain dump before using generated content."] }],
};

function safeArray(value: Json): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function generatedPackFromJson(value: Json): { pack: BrainDumpGeneratedPack; parseFailed: boolean } {
  const parsed = brainDumpOutputSchema.safeParse(value);
  if (parsed.success) return { pack: parsed.data, parseFailed: false };
  return { pack: emptyBrainDumpPack, parseFailed: true };
}

export function rowToBrainDumpRecord(row: BrainDumpRow): BrainDumpRecord {
  const generated = generatedPackFromJson(row.generated_pack);
  return {
    createdAt: row.created_at,
    extractedClaims: safeArray(row.extracted_claims),
    extractedContradictions: safeArray(row.extracted_contradictions),
    extractedExamples: safeArray(row.extracted_examples),
    extractedStories: safeArray(row.extracted_stories),
    extractedThemes: safeArray(row.extracted_themes),
    generatedPack: generated.pack,
    generatedPackParseFailed: generated.parseFailed,
    id: row.id,
    model: row.model,
    promptVersion: row.prompt_version,
    provider: row.provider,
    rawText: row.raw_text,
    strongLines: safeArray(row.strong_lines),
    title: row.title,
  };
}

function promptInputForBrainDump(input: BrainDumpInput) {
  return {
    constraints: [
      "Extract themes, claims, stories, examples, contradictions, and strong lines.",
      "Generate posts, threads, blog outlines, video scripts, campaign ideas, strategy, and clarifying questions.",
      "Generated content is for owner review only and cannot approve or publish anything.",
      "Keep all generated drafts original to the owner; do not imitate external creators.",
    ],
    contextPackets: [
      {
        body: input.rawText,
        label: "owner-brain-dump",
        recordId: null,
        recordType: "brain_dump_raw_text",
        trusted: false,
      },
    ],
    objective: "Transform messy owner notes into structured content options and a usable strategy pack.",
    task: "Transform a CreatorOS Personal brain dump.",
    title: input.title,
  };
}

export async function transformBrainDump(admin: AdminContext, input: BrainDumpInput, options: BrainDumpRunOptions = {}) {
  const response = await runStructuredPrompt({
    admin,
    input: promptInputForBrainDump(input),
    jobType: "brain_dump_transform",
    promptId: PROMPT_ID,
    provider: options.provider,
  });
  const output = validateAiStructuredOutput(response.structured, brainDumpOutputSchema);

  const { data, error } = await admin.supabase
    .from("brain_dumps")
    .insert({
      extracted_claims: output.extracted_claims as Json,
      extracted_contradictions: output.contradictions as Json,
      extracted_examples: output.extracted_examples as Json,
      extracted_stories: output.extracted_stories as Json,
      extracted_themes: output.extracted_themes as Json,
      generated_pack: output as Json,
      metadata: {
        phase: PHASE,
        post_count: output.x_posts.length,
        thread_count: output.x_threads.length,
      },
      model: response.model,
      prompt_version: PROMPT_ID,
      provider: response.provider,
      raw_text: input.rawText,
      strong_lines: output.strong_lines as Json,
      title: input.title,
      user_id: admin.userId,
    })
    .select()
    .single();

  if (error || !data) {
    throw new Error(`Failed to persist brain dump: ${error?.message ?? "missing row"}`);
  }

  await logAuditEvent({
    actorEmail: admin.email,
    eventType: "brain_dump_transformed",
    metadata: {
      blog_outline_count: output.blog_outlines.length,
      phase: PHASE,
      post_count: output.x_posts.length,
      script_count: output.video_scripts.length,
      thread_count: output.x_threads.length,
    },
    success: true,
    targetId: data.id,
    targetType: "brain_dump",
    userId: admin.userId,
  });

  return rowToBrainDumpRecord(data);
}

export async function loadBrainDumpWorkspace(admin: AdminContext, selectedId?: null | string): Promise<BrainDumpWorkspace> {
  const { data, error } = await admin.supabase
    .from("brain_dumps")
    .select("*")
    .eq("user_id", admin.userId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(25);

  if (error) {
    throw new Error(`Failed to load brain dumps: ${error.message}`);
  }

  const dumps = (data ?? []).map(rowToBrainDumpRecord);
  const selectedDump = dumps.find((dump) => dump.id === selectedId) ?? dumps[0] ?? null;

  return { dumps, selectedDump };
}

type BrainDumpGeneratedSection = BrainDumpSaveOutputInput["section"];

type DerivedBrainDumpOutput = {
  text: string;
  type: GeneratedOutputCreateInput["type"];
  variants: Json[];
};

async function loadBrainDumpById(admin: AdminContext, id: string) {
  const { data, error } = await admin.supabase
    .from("brain_dumps")
    .select("*")
    .eq("id", id)
    .eq("user_id", admin.userId)
    .is("deleted_at", null)
    .single();

  if (error || !data) {
    throw new Error(`Brain dump not found: ${error?.message ?? "missing row"}`);
  }

  return rowToBrainDumpRecord(data);
}

function requireGeneratedItem<T>(items: T[], index: number, label: string) {
  const item = items[index];

  if (!item) {
    throw new Error(`${label} index is not available on the source brain dump.`);
  }

  return item;
}

function outlineText(outline: BrainDumpGeneratedPack["blog_outlines"][number]) {
  return [`# ${outline.title}`, "", outline.thesis, "", ...outline.sections.map((section) => `- ${section}`)].join("\n");
}

function scriptText(script: BrainDumpGeneratedPack["video_scripts"][number]) {
  return [`${script.title}`, `Hook: ${script.hook}`, ...script.beats.map((beat) => `- ${beat}`), `CTA: ${script.cta}`].join("\n");
}

function campaignText(campaign: BrainDumpGeneratedPack["campaign_ideas"][number]) {
  return [`${campaign.name}`, campaign.angle, "", ...campaign.sequence.map((item) => `- ${item}`), "", campaign.rationale].join("\n");
}

function threadText(thread: BrainDumpGeneratedPack["x_threads"][number]) {
  return [thread.hook, ...thread.items].join("\n\n");
}

function strategyText(pack: BrainDumpGeneratedPack) {
  return [
    pack.strategy.positioning,
    "",
    "Content pillars:",
    ...pack.strategy.content_pillars.map((item) => `- ${item}`),
    "",
    "Next actions:",
    ...pack.strategy.next_actions.map((item) => `- ${item}`),
  ].join("\n");
}

function generatedOutputFromPack(pack: BrainDumpGeneratedPack, section: BrainDumpGeneratedSection, itemIndex: number): DerivedBrainDumpOutput {
  if (section === "x_post") {
    const post = requireGeneratedItem(pack.x_posts, itemIndex, "Brain dump post");
    return { text: post.text, type: "x_post", variants: [post as unknown as Json] };
  }

  if (section === "x_thread") {
    const thread = requireGeneratedItem(pack.x_threads, itemIndex, "Brain dump thread");
    return { text: threadText(thread), type: "x_thread", variants: [thread as unknown as Json] };
  }

  if (section === "blog_outline") {
    const outline = requireGeneratedItem(pack.blog_outlines, itemIndex, "Brain dump blog outline");
    return { text: outlineText(outline), type: "blog_outline", variants: [outline as unknown as Json] };
  }

  if (section === "video_script") {
    const script = requireGeneratedItem(pack.video_scripts, itemIndex, "Brain dump video script");
    return { text: scriptText(script), type: "video_script", variants: [script as unknown as Json] };
  }

  if (section === "campaign_idea") {
    const campaign = requireGeneratedItem(pack.campaign_ideas, itemIndex, "Brain dump campaign idea");
    return { text: campaignText(campaign), type: "campaign_idea", variants: [campaign as unknown as Json] };
  }

  if (itemIndex !== 0) {
    throw new Error("Brain dump strategy has only one generated item.");
  }

  return { text: strategyText(pack), type: "strategy_note", variants: [pack.strategy as unknown as Json] };
}

export async function saveBrainDumpGeneratedOutput(admin: AdminContext, input: BrainDumpSaveOutputInput) {
  const dump = await loadBrainDumpById(admin, input.brainDumpId);
  const output = generatedOutputFromPack(dump.generatedPack, input.section, input.itemIndex);

  return createGeneratedOutput(admin, {
    favorite: false,
    inputId: dump.id,
    inputType: "brain_dump",
    metadata: {
      item_index: input.itemIndex,
      phase: PHASE,
      section: input.section,
      source: "brain_dump",
    },
    model: dump.model,
    promptVersion: dump.promptVersion ?? PROMPT_ID,
    provider: dump.provider,
    saved: true,
    text: output.text,
    type: output.type,
    variants: output.variants,
  });
}
