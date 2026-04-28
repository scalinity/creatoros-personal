import { z } from "zod";

export const confidenceLabelSchema = z.enum(["fact", "inference", "mixed", "speculation"]);
export const riskLevelSchema = z.enum(["blocking", "high", "low", "medium"]);
export const approvalRecommendationSchema = z.enum(["approve", "block", "revise"]);
export const experimentDecisionSchema = z.enum(["continue", "iterate", "scale", "stop"]);

const nonEmptyString = z.string().trim().min(1);
const boundedAiString = nonEmptyString.max(1_200);
const replyTextString = nonEmptyString.max(280);
const score100Schema = z.number().min(0).max(100);
const score10Schema = z.number().min(0).max(10);

export const evidenceCitationSchema = z.object({
  confidence: confidenceLabelSchema.default("fact"),
  record_id: nonEmptyString.max(160),
  record_type: nonEmptyString.max(80),
  snippet: boundedAiString,
});

export const generatedDraftSchema = z.object({
  rationale: boundedAiString,
  text: nonEmptyString.max(2_000),
});

const profilePinnedDraftSchema = z.object({
  rationale: boundedAiString,
  text: replyTextString,
});

const replyDraftOutputSchema = z.object({
  rationale: boundedAiString,
  text: replyTextString,
});

export const brainDumpBlogOutlineSchema = z.object({
  rationale: nonEmptyString,
  sections: z.array(nonEmptyString).min(1),
  thesis: nonEmptyString,
  title: nonEmptyString,
});

export const brainDumpVideoScriptSchema = z.object({
  beats: z.array(nonEmptyString).min(1),
  cta: nonEmptyString,
  hook: nonEmptyString,
  title: nonEmptyString,
});

export const brainDumpCampaignIdeaSchema = z.object({
  angle: nonEmptyString,
  name: nonEmptyString,
  rationale: nonEmptyString,
  sequence: z.array(nonEmptyString).min(1),
});

export const brainDumpStrategySchema = z.object({
  content_pillars: z.array(nonEmptyString).min(1),
  next_actions: z.array(nonEmptyString).min(1),
  positioning: nonEmptyString,
});

export const metricScoresSchema = z.object({
  algorithm_hygiene_risk: score10Schema,
  clarity: score10Schema,
  emotional_pull: score10Schema,
  format_suitability: score10Schema,
  hook_strength: score10Schema,
  novelty: score10Schema,
  readability_compression: score10Schema,
  reply_engagement_potential: score10Schema,
  specificity: score10Schema,
});

export const algoAnalysisOutputSchema = z.object({
  confidence_label: confidenceLabelSchema,
  heuristic_disclaimer: z.literal("This is a heuristic evaluation, not the official X algorithm."),
  highest_leverage_improvement: nonEmptyString,
  metric_scores: metricScoresSchema,
  overall_score: score100Schema,
  publish_readiness: z.enum(["ready", "revise", "risky"]),
  risk_warnings: z.array(nonEmptyString),
  rewrites: z.array(generatedDraftSchema),
  thread_expansion: z.array(nonEmptyString),
  weaknesses: z.array(nonEmptyString),
});

export const brainDumpOutputSchema = z.object({
  blog_outlines: z.array(brainDumpBlogOutlineSchema).min(1),
  campaign_angles: z.array(nonEmptyString).min(1),
  campaign_ideas: z.array(brainDumpCampaignIdeaSchema).min(1),
  contradictions: z.array(nonEmptyString),
  extracted_claims: z.array(nonEmptyString).min(1),
  extracted_examples: z.array(nonEmptyString),
  extracted_stories: z.array(nonEmptyString),
  extracted_themes: z.array(nonEmptyString).min(1),
  longform_angles: z.array(nonEmptyString).min(1),
  questions: z.array(nonEmptyString).min(1),
  strategy: brainDumpStrategySchema,
  strong_lines: z.array(nonEmptyString).min(1),
  video_scripts: z.array(brainDumpVideoScriptSchema).min(1),
  x_posts: z.array(generatedDraftSchema).min(1),
  x_threads: z.array(
    z.object({
      hook: nonEmptyString,
      items: z.array(nonEmptyString).min(1),
    }),
  ).min(1),
});

export const coachChatOutputSchema = z.object({
  answer: nonEmptyString,
  confidence_labels: z.array(confidenceLabelSchema),
  diagnosis: z.array(nonEmptyString),
  draft_posts: z.array(generatedDraftSchema),
  evidence: z.array(evidenceCitationSchema),
  recommendations: z.array(nonEmptyString),
});

export const postWriterOutputSchema = z.object({
  drafts: z.array(generatedDraftSchema).min(1),
  originality_notes: z.array(nonEmptyString),
  risk_notes: z.array(nonEmptyString),
  suitable_for_approval_review: z.boolean(),
});

export const threadWriterOutputSchema = z.object({
  final_synthesis: nonEmptyString,
  root_hook: nonEmptyString,
  thread_items: z.array(
    z.object({
      sequence_index: z.number().int().min(0),
      text: nonEmptyString,
    }),
  ).min(1),
});

export const replyWriterOutputSchema = z.object({
  drafts: z.array(replyDraftOutputSchema).min(1).max(3),
  hostility_risk: z.enum(["high", "low", "medium"]),
  risk_notes: z.array(boundedAiString).max(5),
});

export const quotePostWriterOutputSchema = z.object({
  drafts: z.array(generatedDraftSchema).min(1),
  original_point: nonEmptyString,
  risk_notes: z.array(nonEmptyString),
});

export const publishingRiskReviewOutputSchema = z.object({
  approval_recommendation: approvalRecommendationSchema,
  policy_or_spam_risks: z.array(nonEmptyString),
  required_owner_checks: z.array(nonEmptyString),
  risk_level: riskLevelSchema,
  similarity_risk: z.enum(["high", "low", "medium", "unknown"]),
  warnings: z.array(nonEmptyString),
});

export const blogDraftOutputSchema = z.object({
  canonical_summary: nonEmptyString,
  categories: z.array(nonEmptyString),
  markdown_body: nonEmptyString,
  meta_description: nonEmptyString,
  originality_notes: z.array(nonEmptyString),
  outline: z.array(nonEmptyString),
  selected_title: nonEmptyString,
  seo_title: nonEmptyString,
  slug: nonEmptyString,
  source_evidence_notes: z.array(nonEmptyString),
  tags: z.array(nonEmptyString),
  title_options: z.array(nonEmptyString).min(1),
  x_post_series: z.array(generatedDraftSchema),
  x_thread_version: threadWriterOutputSchema,
});

export const blogIdeaOutputSchema = z.object({
  ideas: z.array(
    z.object({
      angle: nonEmptyString,
      rationale: nonEmptyString,
      title: nonEmptyString,
    }),
  ).min(1),
});

export const blogOutlineOutputSchema = z.object({
  outline: z.array(nonEmptyString).min(1),
  thesis: nonEmptyString,
  title_options: z.array(nonEmptyString).min(1),
});

export const blogEditorOutputSchema = z.object({
  change_summary: z.array(nonEmptyString),
  edited_markdown: nonEmptyString,
  risk_notes: z.array(nonEmptyString),
});

export const seoMetadataOutputSchema = z.object({
  canonical_summary: nonEmptyString,
  meta_description: nonEmptyString,
  seo_title: nonEmptyString,
  slug: nonEmptyString,
  tags: z.array(nonEmptyString),
});

export const blogRepurposingOutputSchema = z.object({
  originality_notes: z.array(nonEmptyString),
  posts: z.array(generatedDraftSchema).min(1),
  thread: threadWriterOutputSchema,
});

export const accountResearchOutputSchema = z.object({
  audience_hypotheses: z.array(boundedAiString).max(8),
  blog_ideas: z.array(boundedAiString).max(8).default([]),
  campaign_ideas: z.array(boundedAiString).max(8).default([]),
  content_pillars: z.array(boundedAiString).max(8),
  ethical_learnings: z.array(boundedAiString).max(8),
  format_patterns: z.array(boundedAiString).max(8).default([]),
  hook_patterns: z.array(boundedAiString).max(8).default([]),
  idea_seeds: z.array(boundedAiString).max(12),
  patterns: z.array(boundedAiString).max(12),
  positioning: boundedAiString.optional().default("Positioning could not be inferred from the available posts."),
  reply_strategy: z.array(boundedAiString).max(8).default([]),
});

export const inspirationTransformOutputSchema = z.object({
  abstract_structure: z.array(nonEmptyString),
  originality_notes: z.array(nonEmptyString),
  plagiarism_risk: z.enum(["high", "low", "medium"]),
  variants: z.array(generatedDraftSchema).min(1),
});

export const voiceProfileExampleSchema = z.object({
  record_id: nonEmptyString,
  record_type: z.enum(["blog_post", "post"]),
  text: nonEmptyString,
  why_representative: nonEmptyString,
});

export const voiceProfileFormattingHabitsSchema = z.object({
  casing: nonEmptyString,
  emoji_usage: nonEmptyString,
  line_breaks: nonEmptyString,
  long_form_style: nonEmptyString,
  punctuation: nonEmptyString,
  thread_style: nonEmptyString,
});

export const voiceProfileLengthDistributionSchema = z.object({
  blog_words_median: z.number().min(0),
  post_characters_median: z.number().min(0),
  thread_items_median: z.number().min(0),
});

export const voiceProfileOutputSchema = z.object({
  common_phrases: z.array(nonEmptyString),
  cta_patterns: z.array(nonEmptyString),
  examples: z.array(voiceProfileExampleSchema).min(1),
  formatting_habits: voiceProfileFormattingHabitsSchema,
  hook_patterns: z.array(nonEmptyString),
  length_distribution: voiceProfileLengthDistributionSchema,
  sentence_patterns: z.array(nonEmptyString),
  summary: nonEmptyString,
  tone: nonEmptyString,
  topic_clusters: z.array(nonEmptyString),
});

export const historyPlaybookOutputSchema = z.object({
  evidence: z.array(evidenceCitationSchema),
  playbooks: z.array(nonEmptyString),
  repurposing_suggestions: z.array(nonEmptyString),
});

export const growthStrategyOutputSchema = z.object({
  cadence_recommendations: z.array(boundedAiString).max(8),
  campaign_recommendations: z.array(boundedAiString).max(8),
  confidence_label: confidenceLabelSchema,
  evidence: z.array(evidenceCitationSchema).max(12),
  experiment_recommendations: z.array(boundedAiString).max(8),
  profile_optimization_recommendations: z.array(boundedAiString).max(8),
  weekly_strategy: boundedAiString,
});

export const experimentAnalysisOutputSchema = z.object({
  confidence_label: confidenceLabelSchema,
  confounders: z.array(boundedAiString).max(8),
  decision: experimentDecisionSchema,
  hypothesis_supported: z.boolean(),
  next_experiment: boundedAiString,
  result_summary: boundedAiString,
});

export const profileAuditOutputSchema = z.object({
  confidence_label: confidenceLabelSchema,
  findings: z.array(boundedAiString).max(8),
  recommendations: z.array(boundedAiString).max(8),
  score: score100Schema,
  suggested_pinned_post_drafts: z.array(profilePinnedDraftSchema).max(3),
});
