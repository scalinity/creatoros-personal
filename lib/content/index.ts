import "server-only";

import { logAuditEvent } from "@/lib/audit";
import type { AdminContext } from "@/lib/auth/admin";
import type { ContentIdeaCreateInput, ContentIdeaUpdateInput, GeneratedOutputCreateInput, GeneratedOutputStatusActionInput } from "@/lib/content/validation";
import type { ContentIdeaRow, Database, GeneratedOutputRow, Json } from "@/types/database";

export type ComposerIdeaStatus = "active" | "archived" | "drafted" | "inbox" | "used";

export type ComposerFilters = {
  q?: string;
  selected?: string;
  source?: string;
  status?: ComposerIdeaStatus | "all" | "";
};

export type ComposerIdea = {
  createdAt: string;
  favorite: boolean;
  id: string;
  linkedPostId: null | string;
  rawText: string;
  source: string;
  sourceEntityId: null | string;
  sourceEntityType: null | string;
  status: ComposerIdeaStatus | string;
  tags: string[];
  title: null | string;
  updatedAt: string;
};

export type ComposerOutput = {
  archivedAt: null | string;
  copiedAt: null | string;
  createdAt: string;
  favorite: boolean;
  id: string;
  inputId: null | string;
  inputType: null | string;
  model: null | string;
  promptVersion: null | string;
  provider: null | string;
  saved: boolean;
  text: string;
  type: string;
  updatedAt: string;
  variants: Json[];
};

export type ComposerWorkspace = {
  ideas: ComposerIdea[];
  outputs: ComposerOutput[];
  selectedIdea: ComposerIdea | null;
};

type ContentIdeaUpdatePayload = Database["public"]["Tables"]["content_ideas"]["Update"];
type GeneratedOutputUpdatePayload = Database["public"]["Tables"]["generated_outputs"]["Update"];

const PHASE = "10-content-ideas-generated-outputs-composer-base";

function nowIso() {
  return new Date().toISOString();
}

function metadataWithPhase(metadata: Record<string, Json> = {}) {
  return {
    ...metadata,
    phase: PHASE,
  } satisfies Record<string, Json>;
}

function rowToIdea(row: ContentIdeaRow): ComposerIdea {
  return {
    createdAt: row.created_at,
    favorite: row.favorite,
    id: row.id,
    linkedPostId: row.linked_post_id,
    rawText: row.raw_text,
    source: row.source,
    sourceEntityId: row.source_entity_id,
    sourceEntityType: row.source_entity_type,
    status: row.status,
    tags: row.tags,
    title: row.title,
    updatedAt: row.updated_at,
  };
}

function rowToOutput(row: GeneratedOutputRow): ComposerOutput {
  return {
    archivedAt: row.archived_at,
    copiedAt: row.copied_at,
    createdAt: row.created_at,
    favorite: row.favorite,
    id: row.id,
    inputId: row.input_id,
    inputType: row.input_type,
    model: row.model,
    promptVersion: row.prompt_version,
    provider: row.provider,
    saved: row.saved,
    text: row.text,
    type: row.type,
    updatedAt: row.updated_at,
    variants: Array.isArray(row.variants) ? row.variants : [],
  };
}

function matchesIdeaQuery(idea: ComposerIdea, query: string | undefined) {
  const normalized = query?.trim().toLowerCase();
  if (!normalized) return true;

  const haystack = [idea.title, idea.rawText, idea.source, idea.sourceEntityType, ...idea.tags]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return haystack.includes(normalized);
}

export async function createContentIdea(admin: AdminContext, input: ContentIdeaCreateInput) {
  const { data, error } = await admin.supabase
    .from("content_ideas")
    .insert({
      favorite: input.favorite,
      linked_post_id: input.linkedPostId,
      metadata: metadataWithPhase(input.metadata),
      raw_text: input.rawText,
      source: input.source,
      source_entity_id: input.sourceEntityId,
      source_entity_type: input.sourceEntityType,
      status: input.status,
      tags: input.tags,
      title: input.title,
      user_id: admin.userId,
    })
    .select()
    .single();

  if (error || !data) {
    throw new Error(`Failed to create content idea: ${error?.message ?? "missing row"}`);
  }

  await logAuditEvent({
    actorEmail: admin.email,
    eventType: "content_idea_created",
    metadata: {
      phase: PHASE,
      source: input.source,
      source_entity_id: input.sourceEntityId,
      source_entity_type: input.sourceEntityType,
      status: input.status,
      tag_count: input.tags.length,
    },
    success: true,
    targetId: data.id,
    targetType: "content_idea",
    userId: admin.userId,
  });

  return rowToIdea(data);
}

function ideaUpdatePayload(input: ContentIdeaUpdateInput): ContentIdeaUpdatePayload {
  const payload: ContentIdeaUpdatePayload = {};

  if (input.favorite !== undefined) payload.favorite = input.favorite;
  if (input.linkedPostId !== undefined) payload.linked_post_id = input.linkedPostId;
  if (input.metadata !== undefined) payload.metadata = metadataWithPhase(input.metadata);
  if (input.rawText !== undefined) payload.raw_text = input.rawText;
  if (input.source !== undefined) payload.source = input.source;
  if (input.sourceEntityId !== undefined) payload.source_entity_id = input.sourceEntityId;
  if (input.sourceEntityType !== undefined) payload.source_entity_type = input.sourceEntityType;
  if (input.status !== undefined) payload.status = input.status;
  if (input.tags !== undefined) payload.tags = input.tags;
  if (input.title !== undefined) payload.title = input.title;

  return payload;
}

export async function updateContentIdea(admin: AdminContext, input: ContentIdeaUpdateInput) {
  const payload = ideaUpdatePayload(input);
  const changedFields = Object.keys(payload);

  if (changedFields.length === 0) {
    throw new Error("No content idea fields supplied for update.");
  }

  const { data, error } = await admin.supabase
    .from("content_ideas")
    .update(payload)
    .eq("id", input.id)
    .eq("user_id", admin.userId)
    .is("deleted_at", null)
    .select()
    .single();

  if (error || !data) {
    throw new Error(`Failed to update content idea: ${error?.message ?? "missing row"}`);
  }

  await logAuditEvent({
    actorEmail: admin.email,
    eventType: "content_idea_updated",
    metadata: {
      changed_fields: changedFields,
      phase: PHASE,
    },
    success: true,
    targetId: data.id,
    targetType: "content_idea",
    userId: admin.userId,
  });

  return rowToIdea(data);
}

export async function archiveContentIdea(admin: AdminContext, id: string) {
  const { data, error } = await admin.supabase
    .from("content_ideas")
    .update({ status: "archived" })
    .eq("id", id)
    .eq("user_id", admin.userId)
    .is("deleted_at", null)
    .select()
    .single();

  if (error || !data) {
    throw new Error(`Failed to archive content idea: ${error?.message ?? "missing row"}`);
  }

  await logAuditEvent({
    actorEmail: admin.email,
    eventType: "content_idea_archived",
    metadata: { phase: PHASE },
    success: true,
    targetId: data.id,
    targetType: "content_idea",
    userId: admin.userId,
  });

  return rowToIdea(data);
}

export async function createGeneratedOutput(admin: AdminContext, input: GeneratedOutputCreateInput) {
  const { data, error } = await admin.supabase
    .from("generated_outputs")
    .insert({
      favorite: input.favorite,
      input_id: input.inputId,
      input_type: input.inputType,
      metadata: metadataWithPhase(input.metadata),
      model: input.model,
      prompt_version: input.promptVersion,
      provider: input.provider,
      saved: input.saved,
      text: input.text,
      type: input.type,
      user_id: admin.userId,
      variants: input.variants,
    })
    .select()
    .single();

  if (error || !data) {
    throw new Error(`Failed to create generated output: ${error?.message ?? "missing row"}`);
  }

  await logAuditEvent({
    actorEmail: admin.email,
    eventType: "generated_output_saved",
    metadata: {
      input_id: input.inputId,
      input_type: input.inputType,
      phase: PHASE,
      type: input.type,
    },
    success: true,
    targetId: data.id,
    targetType: "generated_output",
    userId: admin.userId,
  });

  return rowToOutput(data);
}

function generatedOutputStatusPayload(input: GeneratedOutputStatusActionInput): GeneratedOutputUpdatePayload {
  const timestamp = nowIso();

  if (input.action === "saved") return { saved: true };
  if (input.action === "unsaved") return { saved: false };
  if (input.action === "favorite") return { favorite: true };
  if (input.action === "unfavorite") return { favorite: false };
  if (input.action === "copied") return { copied_at: timestamp };
  if (input.action === "archived") return { archived_at: timestamp };
  return { archived_at: null };
}

export async function updateGeneratedOutputStatus(admin: AdminContext, input: GeneratedOutputStatusActionInput) {
  const payload = generatedOutputStatusPayload(input);
  const { data, error } = await admin.supabase
    .from("generated_outputs")
    .update(payload)
    .eq("id", input.id)
    .eq("user_id", admin.userId)
    .is("deleted_at", null)
    .select()
    .single();

  if (error || !data) {
    throw new Error(`Failed to update generated output: ${error?.message ?? "missing row"}`);
  }

  await logAuditEvent({
    actorEmail: admin.email,
    eventType: `generated_output_${input.action}`,
    metadata: {
      phase: PHASE,
      status_action: input.action,
    },
    success: true,
    targetId: data.id,
    targetType: "generated_output",
    userId: admin.userId,
  });

  return rowToOutput(data);
}

export async function loadComposerWorkspace(admin: AdminContext, filters: ComposerFilters = {}): Promise<ComposerWorkspace> {
  const { data: ideaRows, error: ideasError } = await admin.supabase
    .from("content_ideas")
    .select("*")
    .eq("user_id", admin.userId)
    .is("deleted_at", null)
    .order("favorite", { ascending: false })
    .order("updated_at", { ascending: false })
    .limit(300);

  if (ideasError) {
    throw new Error(`Failed to load content ideas: ${ideasError.message}`);
  }

  const statusFilter = filters.status && filters.status !== "all" ? filters.status : null;
  const sourceFilter = filters.source?.trim().toLowerCase();
  const ideas = (ideaRows ?? [])
    .map(rowToIdea)
    .filter((idea) => (statusFilter ? idea.status === statusFilter : idea.status !== "archived"))
    .filter((idea) => (sourceFilter ? idea.source.toLowerCase().includes(sourceFilter) : true))
    .filter((idea) => matchesIdeaQuery(idea, filters.q));
  const selectedIdea = ideas.find((idea) => idea.id === filters.selected) ?? ideas[0] ?? null;

  const { data: outputRows, error: outputsError } = await admin.supabase
    .from("generated_outputs")
    .select("*")
    .eq("user_id", admin.userId)
    .is("deleted_at", null)
    .is("archived_at", null)
    .order("favorite", { ascending: false })
    .order("updated_at", { ascending: false })
    .limit(300);

  if (outputsError) {
    throw new Error(`Failed to load generated outputs: ${outputsError.message}`);
  }

  return {
    ideas,
    outputs: (outputRows ?? []).map(rowToOutput),
    selectedIdea,
  };
}
