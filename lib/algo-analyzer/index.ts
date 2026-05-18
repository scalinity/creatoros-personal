import "server-only";

import { logAuditEvent } from "@/lib/audit";
import type { AdminContext } from "@/lib/auth/admin";
import { safeObject } from "@/lib/db/json";
import { createContentIdea, createGeneratedOutput } from "@/lib/content";
import { parseTagInput } from "@/lib/content/validation";
import { algoAnalysisOutputSchema, type AiProvider } from "@/lib/ai";
import { validateAiStructuredOutput } from "@/lib/ai/json";
import { runStructuredPrompt } from "@/lib/ai/run";
import type { AlgoAnalysisReportRow, Json } from "@/types/database";
import { loadActiveVoiceProfile, type VoiceProfile } from "@/lib/voice";

import type { AlgoAnalyzerInput, AnalyzerSaveIdeaInput, AnalyzerSaveOutputInput } from "./validation";

const PHASE = "12-algorithm-analyzer-brain-dump-transformer";
const PROMPT_ID = "algo-analysis.v1";

type AlgoMetricScores = {
  algorithm_hygiene_risk: number;
  clarity: number;
  emotional_pull: number;
  format_suitability: number;
  hook_strength: number;
  novelty: number;
  readability_compression: number;
  reply_engagement_potential: number;
  specificity: number;
};

type AlgoRewrite = {
  rationale: string;
  text: string;
};

export type AlgoAnalysisDiagnosis = {
  heuristicDisclaimer: string;
  highestLeverageImprovement: string;
  weaknesses: string[];
};

export type AlgoPublishReadiness = {
  notes: string[];
  status: "ready" | "revise" | "risky";
};

export type AlgoAnalysisReport = {
  confidenceLabel: string;
  contentType: string;
  createdAt: string;
  diagnosis: AlgoAnalysisDiagnosis;
  draftText: string;
  id: string;
  metricScores: AlgoMetricScores;
  model: null | string;
  overallScore: number;
  promptVersion: null | string;
  provider: null | string;
  publishReadiness: AlgoPublishReadiness;
  riskWarnings: string[];
  rewrites: AlgoRewrite[];
  threadExpansion: string[];
};

export type AlgoAnalyzerWorkspace = {
  reports: AlgoAnalysisReport[];
  selectedReport: AlgoAnalysisReport | null;
};

export type AlgoAnalysisRunOptions = {
  provider?: AiProvider;
};

function safeArray(value: Json): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function metricScoresFromJson(value: Json): AlgoMetricScores {
  const parsed = algoAnalysisOutputSchema.shape.metric_scores.safeParse(value);
  if (parsed.success) return parsed.data;

  return {
    algorithm_hygiene_risk: 0,
    clarity: 0,
    emotional_pull: 0,
    format_suitability: 0,
    hook_strength: 0,
    novelty: 0,
    readability_compression: 0,
    reply_engagement_potential: 0,
    specificity: 0,
  };
}

function rewritesFromJson(value: Json): AlgoRewrite[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => (item && typeof item === "object" && !Array.isArray(item) ? (item as Record<string, Json>) : null))
    .filter((item): item is Record<string, Json> => Boolean(item))
    .map((item) => ({
      rationale: typeof item.rationale === "string" ? item.rationale : "Saved rewrite.",
      text: typeof item.text === "string" ? item.text : "",
    }))
    .filter((item) => item.text.length > 0);
}

function publishReadinessFromJson(value: Json): AlgoPublishReadiness {
  const object = safeObject(value);
  const status = object.status === "ready" || object.status === "risky" || object.status === "revise" ? object.status : "revise";
  const notes = Array.isArray(object.notes) ? object.notes.filter((item): item is string => typeof item === "string") : [];

  return { notes, status };
}

export function rowToAlgoAnalysisReport(row: AlgoAnalysisReportRow): AlgoAnalysisReport {
  const diagnosis = safeObject(row.diagnosis);

  return {
    confidenceLabel: row.confidence_label,
    contentType: row.content_type,
    createdAt: row.created_at,
    diagnosis: {
      heuristicDisclaimer:
        typeof diagnosis.heuristic_disclaimer === "string"
          ? diagnosis.heuristic_disclaimer
          : "This is a heuristic evaluation, not the official X algorithm.",
      highestLeverageImprovement:
        typeof diagnosis.highest_leverage_improvement === "string" ? diagnosis.highest_leverage_improvement : "Review the hook and concrete payoff.",
      weaknesses: Array.isArray(diagnosis.weaknesses)
        ? diagnosis.weaknesses.filter((item): item is string => typeof item === "string")
        : [],
    },
    draftText: row.draft_text,
    id: row.id,
    metricScores: metricScoresFromJson(row.metric_scores),
    model: row.model,
    overallScore: row.overall_score ?? 0,
    promptVersion: row.prompt_version,
    provider: row.provider,
    publishReadiness: publishReadinessFromJson(row.publish_readiness),
    riskWarnings: safeArray(row.risk_warnings),
    rewrites: rewritesFromJson(row.rewrites),
    threadExpansion: safeArray(row.thread_expansion),
  };
}

function promptInputForAnalysis(input: AlgoAnalyzerInput, voiceProfile: VoiceProfile | null) {
  return {
    constraints: [
      "Return exactly nine metric scores from 0 to 10.",
      "Include the required heuristic disclaimer verbatim.",
      "Do not claim access to the official X algorithm.",
      "AI output may be saved as drafts only; do not approve or publish.",
    ],
    content_type: input.contentType,
    contextPackets: [
      {
        body: input.draftText,
        label: "owner-draft",
        recordId: null,
        recordType: "draft_text",
        trusted: false,
      },
    ],
    generate_thread: input.generateThread,
    include_publish_readiness: input.includePublishReadiness,
    objective: "Score this owner draft heuristically and suggest safer, stronger rewrites for owner review.",
    task: "Analyze an X/blog-to-X draft inside CreatorOS Personal.",
    voice_profile: input.useVoiceProfile
      ? voiceProfile
        ? {
            available: true,
            common_phrases: voiceProfile.commonPhrases,
            cta_patterns: voiceProfile.ctaPatterns,
            formatting_habits: voiceProfile.formattingHabits,
            hook_patterns: voiceProfile.hookPatterns,
            id: voiceProfile.id,
            sentence_patterns: voiceProfile.sentencePatterns,
            summary: voiceProfile.summary,
            tone: voiceProfile.tone,
            topic_clusters: voiceProfile.topicClusters,
          }
        : {
            available: false,
            note: "No active voice profile is available yet; analyze the draft without style-specific assumptions.",
          }
      : null,
  };
}

export async function runAlgoAnalysis(admin: AdminContext, input: AlgoAnalyzerInput, options: AlgoAnalysisRunOptions = {}) {
  const voiceProfile = input.useVoiceProfile ? await loadActiveVoiceProfile(admin) : null;
  const response = await runStructuredPrompt({
    admin,
    input: promptInputForAnalysis(input, voiceProfile),
    jobType: "algo_analysis",
    promptId: PROMPT_ID,
    provider: options.provider,
  });
  const output = validateAiStructuredOutput(response.structured, algoAnalysisOutputSchema);
  const diagnosis = {
    heuristic_disclaimer: output.heuristic_disclaimer,
    highest_leverage_improvement: output.highest_leverage_improvement,
    weaknesses: output.weaknesses,
  } satisfies Record<string, Json>;
  const publishReadiness = {
    notes: output.risk_warnings,
    status: output.publish_readiness,
  } satisfies Record<string, Json>;

  const { data, error } = await admin.supabase
    .from("algo_analysis_reports")
    .insert({
      confidence_label: output.confidence_label,
      content_type: input.contentType,
      diagnosis,
      draft_text: input.draftText,
      metadata: {
        generate_thread: input.generateThread,
        include_publish_readiness: input.includePublishReadiness,
        phase: PHASE,
        use_voice_profile: Boolean(voiceProfile),
        voice_profile_requested: input.useVoiceProfile,
      },
      metric_scores: output.metric_scores,
      model: response.model,
      overall_score: output.overall_score,
      prompt_version: PROMPT_ID,
      provider: response.provider,
      publish_readiness: publishReadiness,
      rewrites: output.rewrites,
      risk_warnings: output.risk_warnings,
      thread_expansion: output.thread_expansion,
      user_id: admin.userId,
      voice_profile_id: voiceProfile?.id ?? null,
    })
    .select()
    .single();

  if (error || !data) {
    throw new Error(`Failed to persist algorithm analysis report: ${error?.message ?? "missing row"}`);
  }

  await logAuditEvent({
    actorEmail: admin.email,
    eventType: "algo_analysis_report_created",
    metadata: {
      content_type: input.contentType,
      overall_score: output.overall_score,
      phase: PHASE,
      rewrite_count: output.rewrites.length,
    },
    success: true,
    targetId: data.id,
    targetType: "algo_analysis_report",
    userId: admin.userId,
  });

  return rowToAlgoAnalysisReport(data);
}

export async function loadAlgoAnalyzerWorkspace(admin: AdminContext, selectedId?: null | string): Promise<AlgoAnalyzerWorkspace> {
  const { data, error } = await admin.supabase
    .from("algo_analysis_reports")
    .select("*")
    .eq("user_id", admin.userId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(25);

  if (error) {
    throw new Error(`Failed to load algorithm analysis reports: ${error.message}`);
  }

  const reports = (data ?? []).map(rowToAlgoAnalysisReport);
  const selectedReport = reports.find((report) => report.id === selectedId) ?? reports[0] ?? null;

  return { reports, selectedReport };
}

function outputTypeForContentType(contentType: string) {
  if (contentType === "thread") return "x_thread";
  if (contentType === "reply") return "reply";
  if (contentType === "quote") return "quote_post";
  return "x_post";
}

async function loadAlgoAnalysisReportById(admin: AdminContext, id: string) {
  const { data, error } = await admin.supabase
    .from("algo_analysis_reports")
    .select("*")
    .eq("id", id)
    .eq("user_id", admin.userId)
    .is("deleted_at", null)
    .single();

  if (error || !data) {
    throw new Error(`Algorithm analysis report not found: ${error?.message ?? "missing row"}`);
  }

  return rowToAlgoAnalysisReport(data);
}

function rewriteForIndex(report: AlgoAnalysisReport, index: number) {
  const rewrite = report.rewrites[index];

  if (!rewrite) {
    throw new Error("Analyzer rewrite index is not available on the source report.");
  }

  return rewrite;
}

export async function saveAnalyzerRewriteAsOutput(admin: AdminContext, input: AnalyzerSaveOutputInput) {
  const report = await loadAlgoAnalysisReportById(admin, input.reportId);
  const rewrite = rewriteForIndex(report, input.rewriteIndex);

  return createGeneratedOutput(admin, {
    favorite: false,
    inputId: report.id,
    inputType: "algo_analysis_report",
    metadata: {
      content_type: report.contentType,
      phase: PHASE,
      rationale: rewrite.rationale,
      rewrite_index: input.rewriteIndex,
      source: "algo_analyzer",
    },
    model: report.model,
    promptVersion: report.promptVersion ?? PROMPT_ID,
    provider: report.provider,
    saved: true,
    text: rewrite.text,
    type: outputTypeForContentType(report.contentType),
    variants: [{ rationale: rewrite.rationale, text: rewrite.text }],
  });
}

export async function saveAnalyzerRewriteAsIdea(admin: AdminContext, input: AnalyzerSaveIdeaInput) {
  const report = await loadAlgoAnalysisReportById(admin, input.reportId);
  const rewrite = rewriteForIndex(report, input.rewriteIndex);

  return createContentIdea(admin, {
    favorite: false,
    linkedPostId: null,
    metadata: {
      phase: PHASE,
      rewrite_index: input.rewriteIndex,
      source: "algo_analyzer",
    },
    rawText: rewrite.text,
    source: "algo_analyzer",
    sourceEntityId: report.id,
    sourceEntityType: "algo_analysis_report",
    status: "inbox",
    tags: parseTagInput(input.tags),
    title: input.title,
  });
}
