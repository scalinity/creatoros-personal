import type { AiFinishReason, AiMessage, AiUsage } from "../types";

export function nowMs() {
  return typeof performance === "undefined" ? Date.now() : performance.now();
}

export function elapsedMs(start: number) {
  return Math.max(0, Math.round(nowMs() - start));
}

export function countApproxTokens(input: string) {
  const words = input.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words * 1.35));
}

export function estimateUsage(messages: AiMessage[], content: string): AiUsage {
  const input = countApproxTokens(messages.map((message) => message.content).join("\n"));
  const output = countApproxTokens(content);

  return {
    input_tokens: input,
    output_tokens: output,
    total_tokens: input + output,
  };
}

export function finishReason(value: unknown): AiFinishReason {
  if (value === "end_turn" || value === "stop" || value === "stop_sequence") return "stop";
  if (value === "max_tokens" || value === "length") return "length";
  if (value === "tool_use" || value === "tool_calls") return "tool_call";
  if (value === "content_filter") return "content_filter";
  if (value === "error") return "error";
  return "unknown";
}

export function joinSystemMessages(messages: AiMessage[]) {
  return messages
    .filter((message) => message.role === "system")
    .map((message) => message.content)
    .join("\n\n");
}

export function nonSystemMessages(messages: AiMessage[]) {
  return messages.filter((message) => message.role !== "system");
}

export function redactProviderMetadata(metadata: Record<string, unknown>) {
  const redacted: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(metadata)) {
    if (/authorization|key|secret|token/i.test(key)) {
      redacted[key] = "[redacted]";
    } else {
      redacted[key] = value;
    }
  }

  return redacted;
}
