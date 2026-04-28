import { z } from "zod";

const analyzerContentTypes = ["post", "thread", "reply", "quote", "blog-to-X"] as const;

const booleanish = z.preprocess((value) => {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["1", "on", "true", "yes"].includes(normalized)) return true;
    if (["0", "false", "no", "off", ""].includes(normalized)) return false;
  }
  return false;
}, z.boolean());

const optionalTrimmedTitle = z.preprocess((value) => {
  if (value === null || value === undefined) return null;
  const trimmed = String(value).trim();
  return trimmed.length > 0 ? trimmed : null;
}, z.string().max(160).nullable());

const requiredDraftText = z.preprocess(
  (value) => String(value ?? "").trim(),
  z.string().min(12).max(12_000),
);

export const algoAnalyzerInputSchema = z
  .object({
    content_type: z.enum(analyzerContentTypes).default("post"),
    draft_text: requiredDraftText,
    generate_thread: booleanish.default(false),
    include_publish_readiness: booleanish.default(true),
    use_voice_profile: booleanish.default(false),
  })
  .transform((value) => ({
    contentType: value.content_type,
    draftText: value.draft_text,
    generateThread: value.generate_thread,
    includePublishReadiness: value.include_publish_readiness,
    useVoiceProfile: value.use_voice_profile,
  }));

export const analyzerSaveOutputSchema = z
  .object({
    report_id: z.string().uuid(),
    rewrite_index: z.coerce.number().int().min(0).max(50).default(0),
  })
  .transform((value) => ({
    reportId: value.report_id,
    rewriteIndex: value.rewrite_index,
  }));

export const analyzerSaveIdeaSchema = z
  .object({
    report_id: z.string().uuid(),
    rewrite_index: z.coerce.number().int().min(0).max(50).default(0),
    tags: z.string().trim().max(500).optional().default("algorithm-analysis, rewrite"),
    title: optionalTrimmedTitle.optional(),
  })
  .transform((value) => ({
    reportId: value.report_id,
    rewriteIndex: value.rewrite_index,
    tags: value.tags,
    title: value.title ?? null,
  }));

export type AlgoAnalyzerInput = z.infer<typeof algoAnalyzerInputSchema>;
export type AnalyzerSaveIdeaInput = z.infer<typeof analyzerSaveIdeaSchema>;
export type AnalyzerSaveOutputInput = z.infer<typeof analyzerSaveOutputSchema>;
