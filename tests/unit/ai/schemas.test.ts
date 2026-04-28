import { describe, expect, it } from "vitest";

import { algoAnalysisOutputSchema, brainDumpOutputSchema, confidenceLabelSchema } from "@/lib/ai/schemas";

describe("AI structured output schemas", () => {
  it("validates confidence labels used across AI narratives", () => {
    expect(confidenceLabelSchema.parse("fact")).toBe("fact");
    expect(confidenceLabelSchema.safeParse("official_algorithm_claim").success).toBe(false);
  });

  it("validates heuristic algorithm analysis output without accepting official-algorithm claims", () => {
    const output = algoAnalysisOutputSchema.parse({
      confidence_label: "inference",
      heuristic_disclaimer: "This is a heuristic evaluation, not the official X algorithm.",
      highest_leverage_improvement: "Make the concrete payoff visible in the first line.",
      metric_scores: {
        algorithm_hygiene_risk: 8,
        clarity: 8,
        emotional_pull: 6,
        format_suitability: 7,
        hook_strength: 7,
        novelty: 6,
        readability_compression: 8,
        reply_engagement_potential: 6,
        specificity: 7,
      },
      overall_score: 74,
      publish_readiness: "revise",
      risk_warnings: ["Needs owner review before publishing."],
      rewrites: [{ rationale: "Sharper hook", text: "A better draft." }],
      thread_expansion: [],
      weaknesses: ["Opening line is abstract."],
    });

    expect(output.overall_score).toBe(74);
    expect(output.metric_scores.hook_strength).toBe(7);
  });

  it("validates brain dump transformation packs", () => {
    const result = brainDumpOutputSchema.safeParse({
      campaign_angles: ["Systems as taste"],
      contradictions: [],
      extracted_claims: ["Better workflows make quality less heroic."],
      extracted_examples: [],
      extracted_stories: [],
      extracted_themes: ["workflow"],
      longform_angles: ["A field guide to creator operating systems"],
      questions: ["Where does the current process leak quality?"],
      strong_lines: ["Quality should not require heroic memory."],
      x_posts: [{ rationale: "Concise thesis", text: "Quality should not require heroic memory." }],
      x_threads: [{ hook: "The better system is boring.", items: ["Start with capture.", "Then score."] }],
    });

    expect(result.success).toBe(true);
  });
});
