import "server-only";

import type { ZodTypeAny, z } from "zod";

import { parseStructuredJson } from "../json";
import type {
  AiEmbeddingRequest,
  AiEmbeddingResponse,
  AiProvider,
  AiStructuredRequest,
  AiStructuredResponse,
  AiTextRequest,
  AiTextResponse,
  AiUsage,
} from "../types";
import { elapsedMs, estimateUsage, nowMs } from "./utils";

export type MockAiResponse = {
  content: string;
  usage?: Partial<AiUsage>;
};

export type MockAiProviderOptions = {
  responses?: MockAiResponse[];
};

function usageFromResponse(request: AiTextRequest, content: string, usage?: Partial<AiUsage>): AiUsage {
  const estimated = estimateUsage(request.messages, content);

  return {
    input_tokens: usage?.input_tokens ?? estimated.input_tokens,
    output_tokens: usage?.output_tokens ?? estimated.output_tokens,
    total_tokens: usage?.total_tokens ?? (usage?.input_tokens ?? estimated.input_tokens) + (usage?.output_tokens ?? estimated.output_tokens),
  };
}

export function createMockAiProvider(options: MockAiProviderOptions = {}): AiProvider {
  const queue = [...(options.responses ?? [])];

  function nextResponse() {
    return queue.shift() ?? { content: "{\"summary\":\"mock response\",\"confidence_label\":\"fact\"}" };
  }

  return {
    provider: "mock",

    async embed(request: AiEmbeddingRequest): Promise<AiEmbeddingResponse> {
      const start = nowMs();
      const inputs = Array.isArray(request.input) ? request.input : [request.input];
      const embeddings = inputs.map((input) => {
        const seed = input.length || 1;
        return Array.from({ length: 3072 }, (_, index) => ((seed + index * 17) % 997) / 997);
      });
      const usage = {
        input_tokens: inputs.reduce((sum, input) => sum + Math.max(1, input.split(/\s+/).filter(Boolean).length), 0),
        output_tokens: 0,
        total_tokens: inputs.reduce((sum, input) => sum + Math.max(1, input.split(/\s+/).filter(Boolean).length), 0),
      };

      return {
        embedding_model: request.model,
        embeddings,
        estimated_cost_usd: null,
        latency_ms: elapsedMs(start),
        provider: "mock",
        raw_metadata_redacted: { source: "mock" },
        usage,
      };
    },

    estimateCost() {
      return null;
    },

    async generateStructured<TSchema extends ZodTypeAny>(
      request: AiStructuredRequest<TSchema>,
    ): Promise<AiStructuredResponse<z.infer<TSchema>>> {
      const response = await this.generateText(request);
      return {
        ...response,
        structured: parseStructuredJson(response.content, request.schema),
      };
    },

    async generateText(request: AiTextRequest): Promise<AiTextResponse> {
      const start = nowMs();
      const response = nextResponse();

      return {
        content: response.content,
        estimated_cost_usd: null,
        finish_reason: "stop",
        latency_ms: elapsedMs(start),
        model: request.model,
        provider: "mock",
        raw_metadata_redacted: { source: "mock" },
        usage: usageFromResponse(request, response.content, response.usage),
      };
    },

    async *streamText(request: AiTextRequest): AsyncIterable<string> {
      const response = await this.generateText(request);
      yield response.content;
    },
  };
}
