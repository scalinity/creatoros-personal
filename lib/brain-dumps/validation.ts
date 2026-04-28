import { z } from "zod";

const generatedPackSections = ["blog_outline", "campaign_idea", "strategy", "video_script", "x_post", "x_thread"] as const;

const rawDumpText = z.preprocess(
  (value) => String(value ?? "").trim(),
  z.string().min(40).max(40_000),
);

const optionalTrimmedTitle = z.preprocess((value) => {
  if (value === null || value === undefined) return null;
  const trimmed = String(value).trim();
  return trimmed.length > 0 ? trimmed : null;
}, z.string().max(160).nullable());

export const brainDumpInputSchema = z
  .object({
    raw_text: rawDumpText,
    title: optionalTrimmedTitle.optional(),
  })
  .transform((value) => ({
    rawText: value.raw_text,
    title: value.title ?? null,
  }));

export const brainDumpSaveOutputSchema = z
  .object({
    brain_dump_id: z.string().uuid(),
    item_index: z.coerce.number().int().min(0).max(50).default(0),
    section: z.enum(generatedPackSections),
  })
  .transform((value) => ({
    brainDumpId: value.brain_dump_id,
    itemIndex: value.item_index,
    section: value.section,
  }));

export type BrainDumpInput = z.infer<typeof brainDumpInputSchema>;
export type BrainDumpSaveOutputInput = z.infer<typeof brainDumpSaveOutputSchema>;
