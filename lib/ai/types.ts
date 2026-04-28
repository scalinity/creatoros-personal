import type { z, ZodTypeAny } from "zod";

export type AiProviderName = "anthropic" | "mock" | "openai";
export type AiMessageRole = "assistant" | "system" | "user";
export type AiFinishReason = "content_filter" | "error" | "length" | "stop" | "tool_call" | "unknown";

export type AiMessage = {
  content: string;
  role: AiMessageRole;
};

export type AiUsage = {
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
};

export type AiTextRequest = {
  maxTokens?: number;
  messages: AiMessage[];
  metadata?: Record<string, unknown>;
  model: string;
  signal?: AbortSignal;
  temperature?: number;
};

export type AiTextResponse = {
  content: string;
  estimated_cost_usd: null | number;
  finish_reason: AiFinishReason;
  latency_ms: number;
  model: string;
  provider: AiProviderName;
  raw_metadata_redacted: Record<string, unknown>;
  usage: AiUsage;
};

export type AiStructuredRequest<TSchema extends ZodTypeAny> = AiTextRequest & {
  schema: TSchema;
};

export type AiStructuredResponse<T> = AiTextResponse & {
  structured: T;
};

export type AiEmbeddingRequest = {
  input: string | string[];
  model: string;
  signal?: AbortSignal;
};

export type AiEmbeddingResponse = {
  embedding_model: string;
  embeddings: number[][];
  estimated_cost_usd: null | number;
  latency_ms: number;
  provider: AiProviderName;
  raw_metadata_redacted: Record<string, unknown>;
  usage: AiUsage;
};

export interface AiProvider {
  readonly provider: AiProviderName;
  embed(request: AiEmbeddingRequest): Promise<AiEmbeddingResponse>;
  estimateCost(usage: AiUsage, model?: string): null | number;
  generateStructured<TSchema extends ZodTypeAny>(request: AiStructuredRequest<TSchema>): Promise<AiStructuredResponse<z.infer<TSchema>>>;
  generateText(request: AiTextRequest): Promise<AiTextResponse>;
  streamText(request: AiTextRequest): AsyncIterable<string>;
}

export type ContextPacket = {
  body: string;
  label: string;
  recordId?: null | string;
  recordType?: null | string;
  trusted?: boolean;
};

export type RenderedPrompt = {
  system: string;
  user: string;
};

export type PromptDefinition<TInput extends ZodTypeAny = ZodTypeAny, TOutput extends ZodTypeAny = ZodTypeAny> = {
  id: `${string}.v1`;
  inputSchema: TInput;
  mockOutput: z.infer<TOutput>;
  outputSchema: TOutput;
  promptName: string;
  promptVersion: "v1";
  render(input: z.input<TInput>): RenderedPrompt;
  safetyNotes: string[];
};
