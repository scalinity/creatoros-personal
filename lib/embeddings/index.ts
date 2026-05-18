import "server-only";

import { createHash } from "node:crypto";

import { logAuditEvent } from "@/lib/audit";
import { completeAiJob, createAiJob, getAiRuntimeConfig, getProviderApiKey, type AiProvider } from "@/lib/ai";
import { createMockAiProvider, createOpenAiProvider } from "@/lib/ai/providers";
import type { AdminContext } from "@/lib/auth/admin";
import type { BlogPostRow, BrainDumpRow, ContentIdeaRow, EmbeddingRow, GeneratedOutputRow, Json, PostRow } from "@/types/database";

const PHASE = "13-voice-modeling-and-embeddings-foundation";
const VECTOR_DIMENSION = 3072;
const DEFAULT_LIMIT = 250;

export type EmbeddableEntityType = "blog_post" | "brain_dump" | "content_idea" | "generated_output" | "post";

const EMBEDDABLE_ENTITY_TYPES: EmbeddableEntityType[] = ["blog_post", "brain_dump", "content_idea", "generated_output", "post"];

export type EmbeddableDocument = {
  content: string;
  entityId: string;
  entityType: EmbeddableEntityType;
  metrics: Record<string, number>;
  timestamp: null | string;
  title: null | string;
  userId: string;
};

export type EmbeddingRefreshResult = {
  jobId: null | string;
  mode: "embedding" | "keyword";
  reason?: string;
  refreshed: number;
  skipped: number;
};

export type EmbeddingStatus = {
  fallbackAvailable: boolean;
  indexedCount: number;
  lastRefreshLabel: null | string;
  providerAvailable: boolean;
};

export type EmbeddingRefreshOptions = {
  entityTypes?: EmbeddableEntityType[];
  limit?: number;
  provider?: AiProvider | null;
};

type SourceLoadOptions = {
  entityTypes?: EmbeddableEntityType[];
  limit?: number;
};

function normalizeContent(parts: Array<null | string | undefined>) {
  return parts
    .filter((part): part is string => typeof part === "string" && part.trim().length > 0)
    .join("\n\n")
    .replace(/\s+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, 12_000);
}

export function hashEmbeddingContent(content: string) {
  return createHash("sha256").update(content).digest("hex");
}

function wordsFromJson(value: Json): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function postDocument(row: PostRow): EmbeddableDocument | null {
  if (!row.is_owner_post || !row.text.trim()) return null;

  return {
    content: row.text.trim(),
    entityId: row.id,
    entityType: "post",
    metrics: {
      bookmarks: row.bookmark_count ?? 0,
      impressions: row.impression_count ?? 0,
      likes: row.like_count ?? 0,
      quotes: row.quote_count ?? 0,
      replies: row.reply_count ?? 0,
      reposts: row.repost_count ?? 0,
    },
    timestamp: row.created_at_platform ?? row.updated_at ?? row.created_at,
    title: null,
    userId: row.user_id,
  };
}

function ideaDocument(row: ContentIdeaRow): EmbeddableDocument | null {
  const content = normalizeContent([row.title ?? null, row.raw_text]);
  if (!content) return null;

  return {
    content,
    entityId: row.id,
    entityType: "content_idea",
    metrics: {},
    timestamp: row.updated_at ?? row.created_at,
    title: row.title,
    userId: row.user_id,
  };
}

function generatedOutputDocument(row: GeneratedOutputRow): EmbeddableDocument | null {
  const content = normalizeContent([row.type, row.text]);
  if (!content) return null;

  return {
    content,
    entityId: row.id,
    entityType: "generated_output",
    metrics: {},
    timestamp: row.updated_at ?? row.created_at,
    title: row.type,
    userId: row.user_id,
  };
}

function brainDumpDocument(row: BrainDumpRow): EmbeddableDocument | null {
  const content = normalizeContent([row.title ?? null, row.raw_text, ...wordsFromJson(row.strong_lines)]);
  if (!content) return null;

  return {
    content,
    entityId: row.id,
    entityType: "brain_dump",
    metrics: {},
    timestamp: row.updated_at ?? row.created_at,
    title: row.title,
    userId: row.user_id,
  };
}

function blogDocument(row: BlogPostRow): EmbeddableDocument | null {
  const content = normalizeContent([row.title, row.excerpt, row.canonical_summary, row.markdown]);
  if (!content) return null;

  return {
    content,
    entityId: row.id,
    entityType: "blog_post",
    metrics: {
      reading_time_minutes: row.reading_time_minutes ?? 0,
      word_count: row.word_count ?? 0,
    },
    timestamp: row.updated_at ?? row.created_at,
    title: row.title,
    userId: row.user_id,
  };
}

function wants(options: SourceLoadOptions, entityType: EmbeddableEntityType) {
  return !options.entityTypes || options.entityTypes.includes(entityType);
}

function timestampMs(document: EmbeddableDocument) {
  const value = document.timestamp ? Date.parse(document.timestamp) : 0;
  return Number.isFinite(value) ? value : 0;
}

function balancedDocuments(collections: EmbeddableDocument[][], limit: number) {
  const buckets = collections.map((collection) => [...collection].sort((left, right) => timestampMs(right) - timestampMs(left))).filter((collection) => collection.length > 0);
  const documents: EmbeddableDocument[] = [];
  let bucketIndex = 0;

  while (documents.length < limit && buckets.some((bucket) => bucket.length > 0)) {
    const bucket = buckets[bucketIndex % buckets.length];
    const document = bucket?.shift();

    if (document) {
      documents.push(document);
    }

    bucketIndex += 1;
  }

  return documents;
}

export async function loadEmbeddableDocuments(admin: AdminContext, options: SourceLoadOptions = {}) {
  const limit = options.limit ?? DEFAULT_LIMIT;
  const collections: EmbeddableDocument[][] = [];

  if (wants(options, "post")) {
    const { data, error } = await admin.supabase
      .from("posts")
      .select("*")
      .eq("user_id", admin.userId)
      .eq("is_owner_post", true)
      .is("deleted_at", null)
      .order("created_at_platform", { ascending: false, nullsFirst: false })
      .limit(limit);

    if (error) throw new Error(`Failed to load posts for embeddings: ${error.message}`);
    collections.push((data ?? []).map(postDocument).filter((item): item is EmbeddableDocument => Boolean(item)));
  }

  if (wants(options, "content_idea")) {
    const { data, error } = await admin.supabase
      .from("content_ideas")
      .select("*")
      .eq("user_id", admin.userId)
      .is("deleted_at", null)
      .order("updated_at", { ascending: false })
      .limit(limit);

    if (error) throw new Error(`Failed to load content ideas for embeddings: ${error.message}`);
    collections.push((data ?? []).map(ideaDocument).filter((item): item is EmbeddableDocument => Boolean(item)));
  }

  if (wants(options, "generated_output")) {
    const { data, error } = await admin.supabase
      .from("generated_outputs")
      .select("*")
      .eq("user_id", admin.userId)
      .is("deleted_at", null)
      .order("updated_at", { ascending: false })
      .limit(limit);

    if (error) throw new Error(`Failed to load generated outputs for embeddings: ${error.message}`);
    collections.push((data ?? []).map(generatedOutputDocument).filter((item): item is EmbeddableDocument => Boolean(item)));
  }

  if (wants(options, "brain_dump")) {
    const { data, error } = await admin.supabase
      .from("brain_dumps")
      .select("*")
      .eq("user_id", admin.userId)
      .is("deleted_at", null)
      .order("updated_at", { ascending: false })
      .limit(limit);

    if (error) throw new Error(`Failed to load brain dumps for embeddings: ${error.message}`);
    collections.push((data ?? []).map(brainDumpDocument).filter((item): item is EmbeddableDocument => Boolean(item)));
  }

  if (wants(options, "blog_post")) {
    const { data, error } = await admin.supabase
      .from("blog_posts")
      .select("*")
      .eq("user_id", admin.userId)
      .is("deleted_at", null)
      .order("updated_at", { ascending: false })
      .limit(limit);

    if (error) throw new Error(`Failed to load blog posts for embeddings: ${error.message}`);
    collections.push((data ?? []).map(blogDocument).filter((item): item is EmbeddableDocument => Boolean(item)));
  }

  return balancedDocuments(collections, limit);
}

function defaultEmbeddingProvider(options: EmbeddingRefreshOptions): AiProvider | null {
  if (options.provider !== undefined) return options.provider;

  const config = getAiRuntimeConfig();

  if (config.provider === "mock") {
    return createMockAiProvider();
  }

  const apiKey = getProviderApiKey("openai");
  if (!apiKey) return null;

  return createOpenAiProvider({
    apiKey,
    maxTokens: config.maxTokens,
    model: config.model,
  });
}

function embeddingModel() {
  return getAiRuntimeConfig().embeddingModel;
}

function isVectorDimensionSafe(embeddings: number[][]) {
  return embeddings.every((embedding) => embedding.length === VECTOR_DIMENSION);
}

async function completeJob(admin: AdminContext, jobId: null | string, status: "failed" | "succeeded", error?: string) {
  const completion = await completeAiJob(admin, { error: error ?? null, jobId, status });

  if (!completion.ok) {
    throw new Error(`Failed to complete embedding refresh job: ${completion.reason ?? "unknown"}`);
  }
}

function targetEntityTypes(options: EmbeddingRefreshOptions) {
  return options.entityTypes ?? EMBEDDABLE_ENTITY_TYPES;
}

async function retireStaleEmbeddings(admin: AdminContext, entityTypes: EmbeddableEntityType[], model: string) {
  const retiredAt = new Date().toISOString();

  for (const entityType of entityTypes) {
    const { error } = await admin.supabase
      .from("embeddings")
      .update({ deleted_at: retiredAt })
      .eq("user_id", admin.userId)
      .eq("entity_type", entityType)
      .eq("embedding_model", model)
      .is("deleted_at", null);

    if (error) {
      throw new Error(`Failed to retire stale ${entityType} embeddings: ${error.message}`);
    }
  }
}

export async function refreshEmbeddingsForUser(admin: AdminContext, options: EmbeddingRefreshOptions = {}): Promise<EmbeddingRefreshResult> {
  const documents = await loadEmbeddableDocuments(admin, options);
  const provider = defaultEmbeddingProvider(options);
  const job = await createAiJob(admin, {
    jobType: "embedding_refresh",
    metadata: {
      entity_types: options.entityTypes ?? "all",
      phase: PHASE,
      source_count: documents.length,
    },
    model: embeddingModel(),
    provider: options.provider?.provider ?? (provider?.provider ?? null),
  });

  if (!job.ok) {
    throw new Error(`Failed to create embedding refresh job: ${job.reason ?? "unknown"}`);
  }

  if (!provider) {
    await retireStaleEmbeddings(admin, targetEntityTypes(options), embeddingModel());
    await completeJob(admin, job.jobId ?? null, "succeeded");
    return {
      jobId: job.jobId ?? null,
      mode: "keyword",
      reason: "embedding_provider_unavailable",
      refreshed: 0,
      skipped: documents.length,
    };
  }

  if (documents.length === 0) {
    await retireStaleEmbeddings(admin, targetEntityTypes(options), embeddingModel());
    await completeJob(admin, job.jobId ?? null, "succeeded");
    return { jobId: job.jobId ?? null, mode: "embedding", refreshed: 0, skipped: 0 };
  }

  try {
    const model = embeddingModel();

    // L-26: chunk the embed call so a single OpenAI per-request token-limit
    // failure does not abort the entire refresh. The provider returns
    // embeddings in input order, so we can concatenate the chunked responses.
    const EMBEDDING_BATCH_SIZE = 64;
    const allEmbeddings: number[][] = [];
    let usedModel = model;
    for (let start = 0; start < documents.length; start += EMBEDDING_BATCH_SIZE) {
      const chunk = documents.slice(start, start + EMBEDDING_BATCH_SIZE).map((document) => document.content);
      const chunkResponse = await provider.embed({ input: chunk, model });
      if (chunkResponse.embeddings.length !== chunk.length) {
        await retireStaleEmbeddings(admin, targetEntityTypes(options), chunkResponse.embedding_model);
        await completeJob(admin, job.jobId ?? null, "succeeded");
        return {
          jobId: job.jobId ?? null,
          mode: "keyword",
          reason: "embedding_chunk_length_mismatch",
          refreshed: 0,
          skipped: documents.length,
        };
      }
      allEmbeddings.push(...chunkResponse.embeddings);
      usedModel = chunkResponse.embedding_model;
    }

    const response = { embedding_model: usedModel, embeddings: allEmbeddings };

    if (response.embeddings.length !== documents.length || !isVectorDimensionSafe(response.embeddings)) {
      await retireStaleEmbeddings(admin, targetEntityTypes(options), response.embedding_model);
      await completeJob(admin, job.jobId ?? null, "succeeded");
      return {
        jobId: job.jobId ?? null,
        mode: "keyword",
        reason: "embedding_dimension_mismatch",
        refreshed: 0,
        skipped: documents.length,
      };
    }

    const rows = documents.map((document, index) => ({
      content: document.content,
      content_hash: hashEmbeddingContent(document.content),
      deleted_at: null,
      embedding: response.embeddings[index],
      embedding_model: response.embedding_model,
      entity_id: document.entityId,
      entity_type: document.entityType,
      metadata: {
        metrics: document.metrics,
        phase: PHASE,
        source_timestamp: document.timestamp,
        title: document.title,
      },
      user_id: admin.userId,
    }));

    await retireStaleEmbeddings(admin, targetEntityTypes(options), response.embedding_model);

    const { error } = await admin.supabase
      .from("embeddings")
      .upsert(rows, { onConflict: "user_id,entity_type,entity_id,content_hash,embedding_model" });

    if (error) {
      throw error;
    }

    await completeJob(admin, job.jobId ?? null, "succeeded");
    await logAuditEvent({
      actorEmail: admin.email,
      eventType: "embedding_refresh_completed",
      metadata: {
        embedding_model: response.embedding_model,
        phase: PHASE,
        refreshed: rows.length,
      },
      success: true,
      targetId: job.jobId ?? null,
      targetType: "ai_job",
      userId: admin.userId,
    });

    return {
      jobId: job.jobId ?? null,
      mode: "embedding",
      refreshed: rows.length,
      skipped: 0,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Embedding refresh failed.";
    await completeJob(admin, job.jobId ?? null, "failed", message);
    throw error;
  }
}

function providerAvailable() {
  const config = getAiRuntimeConfig();
  return config.provider === "mock" || Boolean(getProviderApiKey("openai"));
}

export async function loadEmbeddingStatus(admin: AdminContext): Promise<EmbeddingStatus> {
  // SCA-496 (W-17): count + max(updated_at) via RPC instead of pulling
  // the full vector payload for 1000 rows just to read two scalars.
  const { data, error } = await admin.supabase.rpc("creatoros_load_embedding_status", {
    p_user_id: admin.userId,
  });

  if (error) {
    throw new Error(`Failed to load embedding status: ${error.message}`);
  }

  const row = (data ?? [])[0] ?? { indexed_count: 0, last_refresh_at: null };
  const indexedCount = Number(row.indexed_count ?? 0);
  const lastRefresh = row.last_refresh_at ?? null;

  return {
    fallbackAvailable: true,
    indexedCount,
    lastRefreshLabel: lastRefresh,
    providerAvailable: providerAvailable(),
  };
}

export const embeddingVectorDimension = VECTOR_DIMENSION;
