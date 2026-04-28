import "server-only";

import { getAiRuntimeConfig } from "./config";
import { listPromptDefinitions } from "./prompts";
import { aiRateLimitDefaults } from "./rate-limit";

export function getAiFoundationDiagnostics(source: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env) {
  const runtime = getAiRuntimeConfig(source);
  const prompts = listPromptDefinitions();

  return {
    diagnostics_version: "phase-11",
    embedding_model: runtime.embeddingModel,
    max_tokens: runtime.maxTokens,
    model: runtime.model,
    persistence: {
      ai_jobs: "enabled_with_admin_context_or_graceful_noop",
      prompt_runs: "enabled_with_admin_context_or_graceful_noop",
    },
    prompt_registry: {
      count: prompts.length,
      prompts: prompts.map((prompt) => ({
        id: prompt.id,
        prompt_name: prompt.promptName,
        prompt_version: prompt.promptVersion,
      })),
    },
    providers: {
      anthropic: {
        available: runtime.anthropic.available,
        key: runtime.anthropic.keyConfigured ? "present" : "missing",
        model_compatible: runtime.anthropic.modelCompatible,
      },
      mock: { available: true, key: "not_required", model_compatible: true },
      openai: {
        available: runtime.openai.available,
        key: runtime.openai.keyConfigured ? "present" : "optional_missing",
        model_compatible: runtime.openai.modelCompatible,
      },
      selected: runtime.provider,
      selected_available: runtime.providerAvailable,
      selected_model_compatible: runtime.providerModelCompatible,
    },
    rate_limits: aiRateLimitDefaults,
    safety: {
      client_side_ai: "disabled",
      prompt_injection_defense: "context_packets_wrapped_as_untrusted_data",
      secret_redaction: "presence_only",
      structured_outputs: "zod_validated_with_one_repair_attempt",
    },
    thinking: {
      effort: runtime.effort,
      type: runtime.thinkingType,
    },
  };
}
