import "server-only";

import { getAiRuntimeConfig, getProviderApiKey, type AiProvider } from "@/lib/ai";
import { createMockAiProvider, createOpenAiProvider } from "@/lib/ai/providers";
import type { AdminContext } from "@/lib/auth/admin";
import type { EmbeddingRow } from "@/types/database";

import { loadEmbeddableDocuments, type EmbeddableDocument, type EmbeddableEntityType } from "../embeddings";

export type RetrievalEvidenceItem = {
  confidence: "fact" | "inference";
  metrics: Record<string, number>;
  record_id: string;
  record_type: EmbeddableEntityType;
  score: number;
  snippet: string;
  timestamp: null | string;
  user_id: string;
};

export type RetrievalResult = {
  items: RetrievalEvidenceItem[];
  mode: "embedding" | "keyword";
  reason?: string;
};

export type RetrievalQuery = {
  entityTypes?: EmbeddableEntityType[];
  limit?: number;
  query: string;
};

export type RetrievalOptions = {
  provider?: AiProvider | null;
};

const defaultLimit = 8;

function queryTokens(query: string) {
  return query
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .map((token) => token.replace(/s$/, ""))
    .filter((token) => token.length >= 3);
}

function snippetFor(content: string, tokens: string[]) {
  const normalized = content.replace(/\s+/g, " ").trim();
  const lower = normalized.toLowerCase();
  const firstIndex = tokens.reduce((best, token) => {
    const index = lower.indexOf(token);
    if (index === -1) return best;
    return best === -1 ? index : Math.min(best, index);
  }, -1);
  const start = firstIndex === -1 ? 0 : Math.max(0, firstIndex - 60);

  return normalized.slice(start, start + 240);
}

function keywordScore(content: string, tokens: string[]) {
  const lower = content.toLowerCase();

  return tokens.reduce((score, token) => {
    if (lower.includes(token)) return score + 1;
    return score;
  }, 0);
}

function itemFromDocument(document: EmbeddableDocument, score: number, query: string): RetrievalEvidenceItem {
  const tokens = queryTokens(query);

  return {
    confidence: "fact",
    metrics: document.metrics,
    record_id: document.entityId,
    record_type: document.entityType,
    score,
    snippet: snippetFor(document.content, tokens),
    timestamp: document.timestamp,
    user_id: document.userId,
  };
}

function cosineSimilarity(left: number[], right: number[]) {
  let dot = 0;
  let leftMagnitude = 0;
  let rightMagnitude = 0;
  const length = Math.min(left.length, right.length);

  for (let index = 0; index < length; index += 1) {
    const leftValue = left[index] ?? 0;
    const rightValue = right[index] ?? 0;
    dot += leftValue * rightValue;
    leftMagnitude += leftValue * leftValue;
    rightMagnitude += rightValue * rightValue;
  }

  if (leftMagnitude === 0 || rightMagnitude === 0) return 0;
  return dot / (Math.sqrt(leftMagnitude) * Math.sqrt(rightMagnitude));
}

function defaultEmbeddingProvider(options: RetrievalOptions): AiProvider | null {
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

function matchesEntityType(row: EmbeddingRow, entityTypes?: EmbeddableEntityType[]) {
  return !entityTypes || entityTypes.includes(row.entity_type as EmbeddableEntityType);
}

function embeddingModelForRows(rows: EmbeddingRow[]) {
  const configuredModel = getAiRuntimeConfig().embeddingModel;
  if (rows.some((row) => row.embedding_model === configuredModel)) return configuredModel;
  // L-27: prefer the most-frequent stored model rather than the first-row's
  // arbitrary value. When a refresh has not yet migrated old rows, this still
  // returns a usable model; the dimension filter further down rejects rows
  // whose vector length does not match.
  const counts = new Map<string, number>();
  for (const row of rows) {
    counts.set(row.embedding_model, (counts.get(row.embedding_model) ?? 0) + 1);
  }
  let majority: null | string = null;
  let bestCount = 0;
  for (const [model, count] of counts) {
    if (count > bestCount) {
      majority = model;
      bestCount = count;
    }
  }
  return majority ?? rows[0]?.embedding_model ?? configuredModel;
}

function isCompatibleEmbeddingRow(row: EmbeddingRow, model: string, dimension: number) {
  return row.embedding_model === model && Array.isArray(row.embedding) && row.embedding.length === dimension;
}

function metadataRecord(metadata: EmbeddingRow["metadata"]): Record<string, unknown> {
  if (!metadata || Array.isArray(metadata) || typeof metadata !== "object") return {};
  return metadata as Record<string, unknown>;
}

function metricsFromMetadata(metadata: EmbeddingRow["metadata"]) {
  const metrics = metadataRecord(metadata).metrics;

  if (!metrics || Array.isArray(metrics) || typeof metrics !== "object") return {};

  return Object.entries(metrics).reduce<Record<string, number>>((result, [key, value]) => {
    if (typeof value === "number" && Number.isFinite(value)) {
      result[key] = value;
    }

    return result;
  }, {});
}

function timestampFromMetadata(metadata: EmbeddingRow["metadata"]) {
  const timestamp = metadataRecord(metadata).source_timestamp;
  return typeof timestamp === "string" ? timestamp : null;
}

async function embeddingRetrieval(admin: AdminContext, input: RetrievalQuery, provider: AiProvider): Promise<RetrievalResult | null> {
  const { data, error } = await admin.supabase
    .from("embeddings")
    .select("*")
    .eq("user_id", admin.userId)
    .is("deleted_at", null)
    .order("updated_at", { ascending: false })
    .limit(500);

  if (error) {
    throw new Error(`Failed to load embeddings for retrieval: ${error.message}`);
  }

  const rows = ((data ?? []) as EmbeddingRow[]).filter((row) => matchesEntityType(row, input.entityTypes));
  if (rows.length === 0) return null;

  const model = embeddingModelForRows(rows);
  const response = await provider.embed({ input: input.query, model });
  const queryEmbedding = response.embeddings[0];

  if (!queryEmbedding) return null;

  const compatibleRows = rows.filter((row) => isCompatibleEmbeddingRow(row, model, queryEmbedding.length));
  if (compatibleRows.length === 0) return null;

  const items = compatibleRows
    .map((row) => ({
      confidence: "fact" as const,
      metrics: metricsFromMetadata(row.metadata),
      record_id: row.entity_id,
      record_type: row.entity_type as EmbeddableEntityType,
      score: cosineSimilarity(queryEmbedding, row.embedding),
      snippet: snippetFor(row.content, queryTokens(input.query)),
      timestamp: timestampFromMetadata(row.metadata) ?? row.updated_at ?? row.created_at,
      user_id: row.user_id,
    }))
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, input.limit ?? defaultLimit);

  if (items.length === 0) return null;

  return { items, mode: "embedding" };
}

async function keywordRetrieval(admin: AdminContext, input: RetrievalQuery, reason?: string): Promise<RetrievalResult> {
  const tokens = queryTokens(input.query);
  const documents = await loadEmbeddableDocuments(admin, { entityTypes: input.entityTypes, limit: 500 });
  const items = documents
    .map((document) => ({ document, score: keywordScore(document.content, tokens) }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score || (right.document.timestamp ?? "").localeCompare(left.document.timestamp ?? ""))
    .slice(0, input.limit ?? defaultLimit)
    .map((entry) => itemFromDocument(entry.document, entry.score, input.query));

  return {
    items,
    mode: "keyword",
    reason,
  };
}

export async function retrieveEvidence(admin: AdminContext, input: RetrievalQuery, options: RetrievalOptions = {}): Promise<RetrievalResult> {
  const query = input.query.trim();

  if (!query) {
    return { items: [], mode: "keyword", reason: "empty_query" };
  }

  const provider = defaultEmbeddingProvider(options);

  if (provider) {
    try {
      const embedded = await embeddingRetrieval(admin, { ...input, query }, provider);
      if (embedded) return embedded;
    } catch (error) {
      console.error("Embedding retrieval failed; using keyword fallback", {
        reason: error instanceof Error ? error.message : "unknown",
      });
      return keywordRetrieval(admin, { ...input, query }, "embedding_query_failed");
    }
  }

  return keywordRetrieval(admin, { ...input, query }, provider ? "no_embedding_matches" : "embedding_provider_unavailable");
}
