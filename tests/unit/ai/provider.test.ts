import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { getAiRuntimeConfig } from "@/lib/ai/config";
import { createAiProvider } from "@/lib/ai/providers";
import { createAnthropicProvider } from "@/lib/ai/providers/anthropic";
import { createMockAiProvider } from "@/lib/ai/providers/mock";
import { createOpenAiProvider } from "@/lib/ai/providers/openai";
import { withRetryAndTimeout } from "@/lib/ai/retry";
import { z } from "zod";

const structuredSchema = z.object({
  answer: z.string(),
  confidence: z.enum(["fact", "inference", "speculation", "mixed"]),
});

function streamResponse(chunks: string[], init?: ResponseInit) {
  return new Response(
    new ReadableStream({
      start(controller) {
        const encoder = new TextEncoder();
        for (const chunk of chunks) {
          controller.enqueue(encoder.encode(chunk));
        }
        controller.close();
      },
    }),
    init,
  );
}

function jsonBodyFromFetchCall(fetchMock: ReturnType<typeof vi.fn>, index: number) {
  const init = fetchMock.mock.calls[index]?.[1] as RequestInit | undefined;

  if (!init?.body) {
    throw new Error(`Missing fetch request body at call ${index}.`);
  }

  return JSON.parse(String(init.body)) as Record<string, unknown>;
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("AI providers", () => {
  it("normalizes mock text and structured responses without network calls", async () => {
    const provider = createMockAiProvider({
      responses: [
        { content: "plain response" },
        { content: '{"answer":"structured response","confidence":"fact"}' },
      ],
    });

    const text = await provider.generateText({ messages: [{ content: "Say hi", role: "user" }], model: "mock-model" });
    const structured = await provider.generateStructured({
      messages: [{ content: "Return JSON", role: "user" }],
      model: "mock-model",
      schema: structuredSchema,
    });

    expect(text).toMatchObject({ content: "plain response", model: "mock-model", provider: "mock" });
    expect(text.usage.total_tokens).toBeGreaterThan(0);
    expect(structured.structured).toEqual({ answer: "structured response", confidence: "fact" });
    expect(structured.raw_metadata_redacted).toEqual({ source: "mock" });
  });

  it("derives provider runtime config without requiring the optional OpenAI key for Anthropic mode", () => {
    const config = getAiRuntimeConfig({
      AI_EFFORT: "max",
      AI_MAX_TOKENS: "64000",
      AI_MODEL: "claude-opus-4-7",
      AI_PROVIDER: "anthropic",
      AI_THINKING_TYPE: "adaptive",
      ANTHROPIC_API_KEY: "anthropic-placeholder",
    });

    expect(config.provider).toBe("anthropic");
    expect(config.openai.available).toBe(false);
    expect(config.anthropic.available).toBe(true);
    expect(JSON.stringify(config)).not.toContain("anthropic-placeholder");
  });

  it("retries transient failures and preserves the final result", async () => {
    let attempts = 0;

    const result = await withRetryAndTimeout(
      async () => {
        attempts += 1;
        if (attempts < 2) {
          throw new Error("transient provider failure");
        }
        return "ok";
      },
      { retries: 2, timeoutMs: 500 },
    );

    expect(result).toBe("ok");
    expect(attempts).toBe(2);
  });

  it("propagates caller abort signals into provider retry helpers", async () => {
    const controller = new AbortController();
    controller.abort(new Error("caller stopped"));

    await expect(
      withRetryAndTimeout(async () => "ok", { externalSignal: controller.signal, retries: 0, timeoutMs: 500 }),
    ).rejects.toThrow(/caller stopped/);
  });

  it("returns pgvector-compatible mock embeddings", async () => {
    const provider = createMockAiProvider();
    const response = await provider.embed({ input: "owner text", model: "mock-embedding" });

    expect(response.embeddings).toHaveLength(1);
    expect(response.embeddings[0]).toHaveLength(3072);
  });

  it("rejects incompatible provider and model selections", () => {
    expect(() =>
      createAiProvider("openai", {
        AI_MODEL: "claude-opus-4-7",
        AI_PROVIDER: "openai",
        OPENAI_API_KEY: "openai-placeholder",
      }),
    ).toThrow(/incompatible AI_MODEL/);
  });

  it("uses Anthropic streaming responses without temperature when thinking is enabled", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      streamResponse([
        'data: {"type":"message_start","message":{"id":"msg_1","model":"claude-opus-4-7","role":"assistant","type":"message","usage":{"input_tokens":2}}}\n\n',
        'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"hello"}}\n\n',
        'data: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":1}}\n\n',
      ]),
    );
    vi.stubGlobal("fetch", fetchMock);

    const provider = createAnthropicProvider({
      apiKey: "anthropic-placeholder",
      effort: "max",
      maxTokens: 64000,
      model: "claude-opus-4-7",
      thinkingType: "adaptive",
    });

    const response = await provider.generateText({ messages: [{ content: "Say hi", role: "user" }], model: "claude-opus-4-7" });
    const body = jsonBodyFromFetchCall(fetchMock, 0);

    expect(response.content).toBe("hello");
    expect(body.stream).toBe(true);
    // H-9 / L-4: the Anthropic Messages API does not accept `output_config` or
    // a `thinking.type: "adaptive"` value. We now send `thinking.type: "enabled"`
    // with a budget_tokens computed from the configured effort level.
    expect(body.thinking).toEqual({ budget_tokens: expect.any(Number), type: "enabled" });
    expect((body.thinking as { budget_tokens: number }).budget_tokens).toBeGreaterThan(0);
    expect(body).not.toHaveProperty("temperature");
    expect(body).not.toHaveProperty("output_config");
  });

  it("retries OpenAI HTTP failures inside the streaming response path", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('{"error":{"message":"rate limited"}}', { status: 429, statusText: "Too Many Requests" }))
      .mockResolvedValueOnce(
        streamResponse([
          'data: {"type":"response.output_text.delta","delta":"hello"}\n\n',
          'data: {"type":"response.completed","response":{"model":"gpt-5.1","status":"completed","usage":{"input_tokens":2,"output_tokens":1,"total_tokens":3}}}\n\n',
          "data: [DONE]\n\n",
        ]),
      );
    vi.stubGlobal("fetch", fetchMock);

    const provider = createOpenAiProvider({ apiKey: "openai-placeholder", maxTokens: 4096, model: "gpt-5.1", retries: 1 });
    const response = await provider.generateText({ messages: [{ content: "Say hi", role: "user" }], model: "gpt-5.1" });
    const requestBody = jsonBodyFromFetchCall(fetchMock, 1);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(response.content).toBe("hello");
    expect(requestBody.stream).toBe(true);
  });
});
