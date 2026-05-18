import "server-only";

import type { ZodTypeAny, z } from "zod";

import { zodToProviderJsonSchema } from "../json-schema";
import { parseStructuredJson } from "../json";
import type {
  AiEmbeddingResponse,
  AiProvider,
  AiStructuredRequest,
  AiStructuredResponse,
  AiTextRequest,
  AiTextResponse,
  AiUsage,
} from "../types";
import { withRetryAndTimeout } from "../retry";
import { elapsedMs, estimateUsage, finishReason, joinSystemMessages, nonSystemMessages, nowMs, redactProviderMetadata } from "./utils";

export type AnthropicProviderOptions = {
  apiKey: string;
  baseUrl?: string;
  effort: "high" | "low" | "max" | "medium";
  maxTokens: number;
  model: string;
  retries?: number;
  thinkingType: "adaptive";
  timeoutMs?: number;
};

type AnthropicResponse = {
  content?: unknown;
  id?: unknown;
  model?: unknown;
  role?: unknown;
  stop_reason?: unknown;
  type?: unknown;
  usage?: {
    input_tokens?: unknown;
    output_tokens?: unknown;
  };
};

function textFromAnthropicContent(content: unknown) {
  if (!Array.isArray(content)) {
    return "";
  }

  return content
    .map((block) => {
      if (block && typeof block === "object" && "text" in block && typeof block.text === "string") {
        return block.text;
      }

      return "";
    })
    .filter(Boolean)
    .join("\n");
}

function usageFromAnthropic(request: AiTextRequest, content: string, response: AnthropicResponse): AiUsage {
  const estimated = estimateUsage(request.messages, content);
  const inputTokens = typeof response.usage?.input_tokens === "number" ? response.usage.input_tokens : estimated.input_tokens;
  const outputTokens = typeof response.usage?.output_tokens === "number" ? response.usage.output_tokens : estimated.output_tokens;

  return {
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    total_tokens: inputTokens + outputTokens,
  };
}

function messagesForAnthropic(request: AiTextRequest) {
  return nonSystemMessages(request.messages).map((message) => ({
    content: message.content,
    role: message.role === "assistant" ? "assistant" : "user",
  }));
}

// H-9 / L-4: the Anthropic Messages API does NOT accept `output_config` or
// `format: json_schema`. The prior implementation sent it, which silently
// no-op'd at the wire and made the diagnostics misleading. JSON-schema
// enforcement on Anthropic must be Zod-based on our side; we still
// instruct the model textually in the prompt body.
//
// `effort` is also not a wire-level Anthropic field. We map the four levels to
// `thinking.budget_tokens` per the Anthropic Messages API extended-thinking
// docs. The `low` level disables thinking; higher levels grow the budget.
// Anthropic's extended-thinking minimum is 1024 budget tokens, and the
// assistant still needs headroom after thinking to emit the actual response.
// If the caller's max_tokens is less than this combined floor we cannot
// produce a valid {thinking, completion} split — better to disable thinking
// silently than to fail the request with a 400 from Anthropic.
const THINKING_MIN_TOTAL_TOKENS = 2_048;
const THINKING_BUDGETS_BY_EFFORT: Record<Exclude<AnthropicProviderOptions["effort"], "low">, number> = {
  high: 32_000,
  max: 64_000,
  medium: 8_000,
};

function thinkingBlock(options: AnthropicProviderOptions, requestMaxTokens: number) {
  const effort = options.effort;
  if (effort === "low") {
    return undefined;
  }

  if (requestMaxTokens < THINKING_MIN_TOTAL_TOKENS) {
    // Caller explicitly chose a small budget; respect it and skip thinking.
    // Logging at debug level rather than warn/error: this is a normal config
    // outcome, not a defect.
    console.debug("Anthropic thinking disabled: requestMaxTokens below floor", { effort, requestMaxTokens });
    return undefined;
  }

  // Cap budget_tokens at request max_tokens minus a completion margin so the
  // assistant has room to actually emit JSON after thinking.
  const maxBudget = Math.max(1_024, requestMaxTokens - 1_024);
  const budget = Math.min(THINKING_BUDGETS_BY_EFFORT[effort], maxBudget);

  return {
    budget_tokens: budget,
    // Only "enabled" is on the public API today. The internal `adaptive` value
    // is preserved in options for forward compatibility but does not flow to
    // the wire.
    type: "enabled" as const,
  };
}

function requestBody(request: AiTextRequest, options: AnthropicProviderOptions, stream: boolean) {
  const model = request.model || options.model;
  const maxTokens = request.maxTokens ?? options.maxTokens;
  const system = joinSystemMessages(request.messages);
  const thinking = thinkingBlock(options, maxTokens);

  return {
    ...(system ? { system } : {}),
    max_tokens: maxTokens,
    messages: messagesForAnthropic(request),
    model,
    stream,
    ...(thinking ? { thinking } : {}),
  };
}

function parseAnthropicStreamEvent(raw: string) {
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
}

async function readAnthropicStream(response: Response): Promise<AnthropicResponse> {
  const reader = response.body?.getReader();

  if (!reader) {
    response.body?.cancel().catch(() => {});
    return { content: [] };
  }

  const decoder = new TextDecoder();
  let buffer = "";
  let text = "";
  let inputTokens: number | undefined;
  let outputTokens: number | undefined;
  let id: unknown;
  let model: unknown;
  let role: unknown;
  let stopReason: unknown;
  let type: unknown = "message";

  // Process a finalized line. Extracted so we can flush whatever is left in the
  // buffer after the stream signals done — providers do not always send a
  // trailing newline, so the final event would otherwise be discarded.
  const consumeLine = (line: string) => {
    if (!line.startsWith("data:")) {
      return;
    }

    const event = parseAnthropicStreamEvent(line.slice(5).trim());
    if (!event) {
      return;
    }

    if (event.type === "message_start" && event.message && typeof event.message === "object") {
      const message = event.message as Record<string, unknown>;
      id = message.id;
      model = message.model;
      role = message.role;
      type = message.type;
      const usage = message.usage as Record<string, unknown> | undefined;
      inputTokens = typeof usage?.input_tokens === "number" ? usage.input_tokens : inputTokens;
    }

    if (event.type === "content_block_delta" && event.delta && typeof event.delta === "object") {
      const delta = event.delta as Record<string, unknown>;
      if (delta.type === "text_delta" && typeof delta.text === "string") {
        text += delta.text;
      }
    }

    if (event.type === "message_delta") {
      const delta = event.delta as Record<string, unknown> | undefined;
      const usage = event.usage as Record<string, unknown> | undefined;
      stopReason = delta?.stop_reason ?? stopReason;
      outputTokens = typeof usage?.output_tokens === "number" ? usage.output_tokens : outputTokens;
    }
  };

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        consumeLine(line);
      }
    }

    // Flush any final event the provider sent without a trailing newline.
    buffer += decoder.decode();
    if (buffer.length > 0) {
      consumeLine(buffer);
    }
  } finally {
    reader.cancel().catch(() => {});
  }

  return {
    content: [{ text, type: "text" }],
    id,
    model,
    role,
    stop_reason: stopReason,
    type,
    usage: {
      input_tokens: inputTokens,
      output_tokens: outputTokens,
    },
  };
}

export function createAnthropicProvider(options: AnthropicProviderOptions): AiProvider {
  const baseUrl = options.baseUrl ?? "https://api.anthropic.com/v1/messages";

  return {
    provider: "anthropic",

    async embed(): Promise<AiEmbeddingResponse> {
      throw new Error("Anthropic embeddings are not configured for CreatorOS Phase 11. Use OpenAI or mock embeddings.");
    },

    estimateCost() {
      return null;
    },

    async generateStructured<TSchema extends ZodTypeAny>(
      request: AiStructuredRequest<TSchema>,
    ): Promise<AiStructuredResponse<z.infer<TSchema>>> {
      const response = await this.generateText({
        ...request,
        messages: [
          ...request.messages,
          {
            content: "Return only valid JSON matching the registered schema. Do not wrap it in markdown.",
            role: "user",
          },
        ],
        metadata: {
          ...(request.metadata ?? {}),
          outputJsonSchema: zodToProviderJsonSchema(request.schema),
          outputSchemaName: "creatoros_structured_output",
        },
      });

      return {
        ...response,
        structured: parseStructuredJson(response.content, request.schema),
      };
    },

    async generateText(request: AiTextRequest): Promise<AiTextResponse> {
      const start = nowMs();
      const model = request.model || options.model;
      const body = requestBody(request, options, true);

      const json = await withRetryAndTimeout(
        async (signal) => {
          const response = await fetch(baseUrl, {
            body: JSON.stringify(body),
            headers: {
              "anthropic-version": "2023-06-01",
              "content-type": "application/json",
              "x-api-key": options.apiKey,
            },
            method: "POST",
            signal,
          });
          const errorJson = response.ok ? null : ((await response.json().catch(() => ({}))) as { error?: { message?: string } });

          if (!response.ok) {
            throw new Error(`Anthropic provider unavailable: ${errorJson?.error?.message ?? response.statusText}`);
          }

          return readAnthropicStream(response);
        },
        { externalSignal: request.signal, retries: options.retries ?? 1, timeoutMs: options.timeoutMs ?? 300_000 },
      );

      const content = textFromAnthropicContent(json.content);

      return {
        content,
        estimated_cost_usd: null,
        finish_reason: finishReason(json.stop_reason),
        latency_ms: elapsedMs(start),
        model: typeof json.model === "string" ? json.model : model,
        provider: "anthropic",
        raw_metadata_redacted: redactProviderMetadata({
          id: json.id,
          role: json.role,
          stop_reason: json.stop_reason,
          type: json.type,
        }),
        usage: usageFromAnthropic(request, content, json),
      };
    },

    async *streamText(request: AiTextRequest): AsyncIterable<string> {
      const body = requestBody(request, options, true);
      const response = await withRetryAndTimeout(
        async (signal) => {
          const retryResponse = await fetch(baseUrl, {
            body: JSON.stringify(body),
            headers: {
              "anthropic-version": "2023-06-01",
              "content-type": "application/json",
              "x-api-key": options.apiKey,
            },
            method: "POST",
            signal,
          });

          if (!retryResponse.ok) {
            const errorJson = (await retryResponse.json().catch(() => ({}))) as { error?: { message?: string } };
            throw new Error(`Anthropic provider unavailable: ${errorJson.error?.message ?? retryResponse.statusText}`);
          }

          return retryResponse;
        },
        { externalSignal: request.signal, retries: options.retries ?? 1, timeoutMs: options.timeoutMs ?? 300_000 },
      );

      const reader = response.body?.getReader();
      if (!reader) {
        response.body?.cancel().catch(() => {});
        return;
      }

      const decoder = new TextDecoder();
      let buffer = "";

      const yieldTextFromLine = function* (line: string) {
        if (!line.startsWith("data:")) return;
        const event = parseAnthropicStreamEvent(line.slice(5).trim());
        const delta = event?.delta;
        if (delta && typeof delta === "object" && "type" in delta && delta.type === "text_delta" && "text" in delta && typeof delta.text === "string") {
          yield delta.text;
        }
      };

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split(/\r?\n/);
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            yield* yieldTextFromLine(line);
          }
        }

        buffer += decoder.decode();
        if (buffer.length > 0) {
          yield* yieldTextFromLine(buffer);
        }
      } finally {
        reader.cancel().catch(() => {});
      }
    },
  };
}
