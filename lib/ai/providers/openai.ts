import "server-only";

import type { ZodTypeAny, z } from "zod";

import { zodToProviderJsonSchema } from "../json-schema";
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
import { withRetryAndTimeout } from "../retry";
import { elapsedMs, estimateUsage, finishReason, nowMs, redactProviderMetadata } from "./utils";

export type OpenAiProviderOptions = {
  apiKey: string;
  baseUrl?: string;
  embeddingBaseUrl?: string;
  maxTokens: number;
  model: string;
  retries?: number;
  timeoutMs?: number;
};

type OpenAiResponsesPayload = {
  error?: { message?: string };
  id?: unknown;
  model?: unknown;
  object?: unknown;
  output?: unknown;
  output_text?: unknown;
  status?: unknown;
  usage?: {
    input_tokens?: unknown;
    output_tokens?: unknown;
    total_tokens?: unknown;
  };
};

type OpenAiEmbeddingPayload = {
  data?: unknown;
  error?: { message?: string };
  model?: unknown;
  usage?: {
    prompt_tokens?: unknown;
    total_tokens?: unknown;
  };
};

function textFromOutput(output: unknown) {
  if (typeof output === "string") {
    return output;
  }

  if (!Array.isArray(output)) {
    return "";
  }

  return output
    .flatMap((item) => {
      if (!item || typeof item !== "object" || !("content" in item) || !Array.isArray(item.content)) {
        return [];
      }

      return item.content.map((content: unknown) => {
        if (content && typeof content === "object" && "text" in content && typeof content.text === "string") {
          return content.text;
        }

        return "";
      });
    })
    .filter(Boolean)
    .join("\n");
}

function usageFromOpenAi(request: AiTextRequest, content: string, payload: OpenAiResponsesPayload): AiUsage {
  const estimated = estimateUsage(request.messages, content);
  const inputTokens = typeof payload.usage?.input_tokens === "number" ? payload.usage.input_tokens : estimated.input_tokens;
  const outputTokens = typeof payload.usage?.output_tokens === "number" ? payload.usage.output_tokens : estimated.output_tokens;
  const totalTokens = typeof payload.usage?.total_tokens === "number" ? payload.usage.total_tokens : inputTokens + outputTokens;

  return {
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    total_tokens: totalTokens,
  };
}

function inputForResponsesApi(request: AiTextRequest) {
  return request.messages.map((message) => ({
    content: message.content,
    role: message.role === "system" ? "developer" : message.role,
  }));
}

function embeddingsFromPayload(payload: OpenAiEmbeddingPayload) {
  if (!Array.isArray(payload.data)) {
    return [];
  }

  return payload.data.flatMap((item) => {
    if (!item || typeof item !== "object" || !("embedding" in item) || !Array.isArray(item.embedding)) {
      return [];
    }

    const vector = item.embedding.filter((value: unknown): value is number => typeof value === "number");
    return vector.length > 0 ? [vector] : [];
  });
}

type OpenAiTextFormatMetadata = {
  outputJsonSchema?: unknown;
  outputSchemaName?: string;
};

function textFormatFromMetadata(metadata: AiTextRequest["metadata"]) {
  const structured = metadata as OpenAiTextFormatMetadata | undefined;

  if (!structured?.outputJsonSchema) {
    return undefined;
  }

  return {
    format: {
      name: structured.outputSchemaName ?? "creatoros_structured_output",
      schema: structured.outputJsonSchema,
      strict: true,
      type: "json_schema",
    },
  };
}

function responsesBody(request: AiTextRequest, model: string, maxTokens: number) {
  return {
    input: inputForResponsesApi(request),
    max_output_tokens: request.maxTokens ?? maxTokens,
    model,
    stream: true,
    temperature: request.temperature ?? 0.2,
    ...(textFormatFromMetadata(request.metadata) ? { text: textFormatFromMetadata(request.metadata) } : {}),
  };
}

function parseOpenAiStreamEvent(raw: string) {
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
}

async function readOpenAiStream(response: Response): Promise<OpenAiResponsesPayload> {
  const reader = response.body?.getReader();

  if (!reader) {
    return { output_text: "" };
  }

  const decoder = new TextDecoder();
  let buffer = "";
  let outputText = "";
  let completed: OpenAiResponsesPayload = {};

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.startsWith("data:")) continue;
      const raw = line.slice(5).trim();
      if (raw === "[DONE]") continue;

      const event = parseOpenAiStreamEvent(raw);
      if (!event) continue;

      if (event.type === "response.output_text.delta" && typeof event.delta === "string") {
        outputText += event.delta;
      }

      if (event.type === "response.output_text.done" && typeof event.text === "string") {
        outputText = event.text;
      }

      if (event.type === "response.completed" && event.response && typeof event.response === "object") {
        completed = event.response as OpenAiResponsesPayload;
      }
    }
  }

  return {
    ...completed,
    output_text: outputText || completed.output_text,
  };
}

export function createOpenAiProvider(options: OpenAiProviderOptions): AiProvider {
  const baseUrl = options.baseUrl ?? "https://api.openai.com/v1/responses";
  const embeddingBaseUrl = options.embeddingBaseUrl ?? "https://api.openai.com/v1/embeddings";

  return {
    provider: "openai",

    async embed(request: AiEmbeddingRequest): Promise<AiEmbeddingResponse> {
      const start = nowMs();
      const json = await withRetryAndTimeout(
        async (signal) => {
          const response = await fetch(embeddingBaseUrl, {
            body: JSON.stringify({ input: request.input, model: request.model }),
            headers: {
              authorization: `Bearer ${options.apiKey}`,
              "content-type": "application/json",
            },
            method: "POST",
            signal,
          });
          const payload = (await response.json().catch(() => ({}))) as OpenAiEmbeddingPayload;

          if (!response.ok) {
            throw new Error(`OpenAI embeddings unavailable: ${payload.error?.message ?? response.statusText}`);
          }

          return payload;
        },
        { externalSignal: request.signal, retries: options.retries ?? 1, timeoutMs: options.timeoutMs ?? 60_000 },
      );

      const inputTokens = typeof json.usage?.prompt_tokens === "number" ? json.usage.prompt_tokens : 0;
      const totalTokens = typeof json.usage?.total_tokens === "number" ? json.usage.total_tokens : inputTokens;

      return {
        embedding_model: typeof json.model === "string" ? json.model : request.model,
        embeddings: embeddingsFromPayload(json),
        estimated_cost_usd: null,
        latency_ms: elapsedMs(start),
        provider: "openai",
        raw_metadata_redacted: { source: "openai_embeddings" },
        usage: { input_tokens: inputTokens, output_tokens: 0, total_tokens: totalTokens },
      };
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
      const json = await withRetryAndTimeout(
        async (signal) => {
          const response = await fetch(baseUrl, {
            body: JSON.stringify(responsesBody(request, model, options.maxTokens)),
            headers: {
              authorization: `Bearer ${options.apiKey}`,
              "content-type": "application/json",
            },
            method: "POST",
            signal,
          });

          if (!response.ok) {
            const payload = (await response.json().catch(() => ({}))) as OpenAiResponsesPayload;
            throw new Error(`OpenAI provider unavailable: ${payload.error?.message ?? response.statusText}`);
          }

          return readOpenAiStream(response);
        },
        { externalSignal: request.signal, retries: options.retries ?? 1, timeoutMs: options.timeoutMs ?? 300_000 },
      );

      const content = typeof json.output_text === "string" ? json.output_text : textFromOutput(json.output);

      return {
        content,
        estimated_cost_usd: null,
        finish_reason: finishReason(json.status === "completed" ? "stop" : json.status),
        latency_ms: elapsedMs(start),
        model: typeof json.model === "string" ? json.model : model,
        provider: "openai",
        raw_metadata_redacted: redactProviderMetadata({
          id: json.id,
          object: json.object,
          status: json.status,
        }),
        usage: usageFromOpenAi(request, content, json),
      };
    },

    async *streamText(request: AiTextRequest): AsyncIterable<string> {
      const model = request.model || options.model;
      const response = await withRetryAndTimeout(
        async (signal) => {
          const retryResponse = await fetch(baseUrl, {
            body: JSON.stringify(responsesBody(request, model, options.maxTokens)),
            headers: {
              authorization: `Bearer ${options.apiKey}`,
              "content-type": "application/json",
            },
            method: "POST",
            signal,
          });

          if (!retryResponse.ok) {
            const payload = (await retryResponse.json().catch(() => ({}))) as OpenAiResponsesPayload;
            throw new Error(`OpenAI provider unavailable: ${payload.error?.message ?? retryResponse.statusText}`);
          }

          return retryResponse;
        },
        { externalSignal: request.signal, retries: options.retries ?? 1, timeoutMs: options.timeoutMs ?? 300_000 },
      );

      const reader = response.body?.getReader();
      if (!reader) return;

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data:")) continue;
          const raw = line.slice(5).trim();
          if (raw === "[DONE]") continue;
          const event = parseOpenAiStreamEvent(raw);
          if (event?.type === "response.output_text.delta" && typeof event.delta === "string") {
            yield event.delta;
          }
        }
      }
    },
  };
}
