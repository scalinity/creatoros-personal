import "server-only";

import type { AiProviderName } from "./types";

export type AiEffort = "high" | "low" | "max" | "medium";

export type AiRuntimeConfig = {
  anthropic: {
    available: boolean;
    keyConfigured: boolean;
    modelCompatible: boolean;
  };
  embeddingModel: string;
  effort: AiEffort;
  maxTokens: number;
  model: string;
  openai: {
    available: boolean;
    keyConfigured: boolean;
    modelCompatible: boolean;
  };
  provider: AiProviderName;
  providerAvailable: boolean;
  providerModelCompatible: boolean;
  thinkingType: "adaptive";
};

type EnvSource = Record<string, string | undefined>;

const providerValues = new Set<AiProviderName>(["anthropic", "mock", "openai"]);
const effortValues = new Set<AiEffort>(["high", "low", "max", "medium"]);

function nonEmpty(value: string | undefined) {
  return typeof value === "string" && value.trim().length > 0;
}

function parseProvider(value: string | undefined): AiProviderName {
  return providerValues.has(value as AiProviderName) ? (value as AiProviderName) : "anthropic";
}

function parseEffort(value: string | undefined): AiEffort {
  return effortValues.has(value as AiEffort) ? (value as AiEffort) : "max";
}

function parseMaxTokens(value: string | undefined) {
  const parsed = Number(value ?? "64000");
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 64_000;
}

export function isAiModelCompatible(provider: AiProviderName, model: string) {
  const normalized = model.trim().toLowerCase();

  if (provider === "mock") {
    return true;
  }

  if (provider === "anthropic") {
    return normalized.startsWith("claude-");
  }

  return !normalized.startsWith("claude-");
}

export function getAiRuntimeConfig(source: EnvSource = process.env): AiRuntimeConfig {
  const provider = parseProvider(source.AI_PROVIDER);
  const model = source.AI_MODEL?.trim() || "claude-opus-4-7";
  const anthropicKeyConfigured = nonEmpty(source.ANTHROPIC_API_KEY);
  const openaiKeyConfigured = nonEmpty(source.OPENAI_API_KEY);
  const anthropicModelCompatible = isAiModelCompatible("anthropic", model);
  const openaiModelCompatible = isAiModelCompatible("openai", model);
  const providerModelCompatible = isAiModelCompatible(provider, model);
  const providerAvailable =
    provider === "mock" ||
    (provider === "anthropic" && anthropicKeyConfigured && anthropicModelCompatible) ||
    (provider === "openai" && openaiKeyConfigured && openaiModelCompatible);

  return {
    anthropic: {
      available: anthropicKeyConfigured && anthropicModelCompatible,
      keyConfigured: anthropicKeyConfigured,
      modelCompatible: anthropicModelCompatible,
    },
    embeddingModel: source.AI_EMBEDDING_MODEL?.trim() || "text-embedding-3-large",
    effort: parseEffort(source.AI_EFFORT),
    maxTokens: parseMaxTokens(source.AI_MAX_TOKENS),
    model,
    openai: {
      available: openaiKeyConfigured && openaiModelCompatible,
      keyConfigured: openaiKeyConfigured,
      modelCompatible: openaiModelCompatible,
    },
    provider,
    providerAvailable,
    providerModelCompatible,
    thinkingType: "adaptive",
  };
}

export function getProviderApiKey(provider: AiProviderName, source: EnvSource = process.env) {
  if (provider === "anthropic") {
    return source.ANTHROPIC_API_KEY?.trim() ?? "";
  }

  if (provider === "openai") {
    return source.OPENAI_API_KEY?.trim() ?? "";
  }

  return "";
}
