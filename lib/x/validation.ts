import { z } from "zod";

const allowedReturnTargets = new Set(["/settings/x-connection"]);

const booleanish = z
  .union([z.boolean(), z.string()])
  .optional()
  .transform((value) => value === true || value === "true" || value === "on");

const oauthReturnTarget = z
  .string()
  .trim()
  .max(120)
  .optional()
  .default("/settings/x-connection")
  .transform((value) => (allowedReturnTargets.has(value) ? value : "/settings/x-connection"));

export const xOAuthStartQuerySchema = z.object({
  mode: z.enum(["read", "publishing"]).optional().default("read"),
  return_to: oauthReturnTarget,
});

export const xOAuthCallbackQuerySchema = z.object({
  code: z.string().trim().min(1).max(2_048).optional(),
  error: z.string().trim().min(1).max(120).optional(),
  error_description: z.string().trim().min(1).max(500).optional(),
  state: z.string().trim().min(1).max(160).optional(),
});

export const xDisconnectSchema = z.object({
  delete_imported_posts: booleanish.default(false),
  delete_snapshots: booleanish.default(false),
});

export const xReadSyncSchema = z.object({
  include_metrics: booleanish.default(true),
  max_posts: z.coerce.number().int().min(1).max(100).optional().default(25),
  mode: z.enum(["live", "mock"]).optional().default("live"),
});

export function formDataToXRecord(formData: FormData) {
  return Object.fromEntries(formData.entries());
}
