import "server-only";

import { getAiRuntimeConfig, getProviderApiKey, isAiModelCompatible } from "../config";
import type { AiProvider, AiProviderName } from "../types";
import { createAnthropicProvider } from "./anthropic";
import { createMockAiProvider } from "./mock";
import { createOpenAiProvider } from "./openai";

type EnvSource = Record<string, string | undefined>;

export function createAiProvider(providerName?: AiProviderName, source: EnvSource = process.env): AiProvider {
  const config = getAiRuntimeConfig(source);
  const selected = providerName ?? config.provider;

  if (selected === "mock") {
    return createMockAiProvider();
  }

  if (!isAiModelCompatible(selected, config.model)) {
    throw new Error(`${selected} provider selected with incompatible AI_MODEL (${config.model}).`);
  }

  if (selected === "openai") {
    const apiKey = getProviderApiKey("openai", source);
    if (!apiKey) {
      throw new Error("OpenAI provider selected but OPENAI_API_KEY is not configured.");
    }

    return createOpenAiProvider({
      apiKey,
      maxTokens: config.maxTokens,
      model: config.model,
    });
  }

  const apiKey = getProviderApiKey("anthropic", source);
  if (!apiKey) {
    throw new Error("Anthropic provider selected but ANTHROPIC_API_KEY is not configured.");
  }

  return createAnthropicProvider({
    apiKey,
    effort: config.effort,
    maxTokens: config.maxTokens,
    model: config.model,
    thinkingType: config.thinkingType,
  });
}

export { createAnthropicProvider } from "./anthropic";
export { createMockAiProvider } from "./mock";
export { createOpenAiProvider } from "./openai";
