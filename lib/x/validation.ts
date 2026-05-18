import { z } from "zod";

const allowedReturnTargets = new Set(["/settings/x-connection"]);

const booleanish = z
  .union([z.boolean(), z.string()])
  .optional()
  .transform((value) => value === true || value === "true" || value === "on");
// Confirmation must START WITH a known token followed by a word boundary.
// Plain substring matching previously accepted phrases like "please don't
// delete" or "we will never approve" or "i confirmation"; this version still
// allows an audit-friendly suffix ("approve exact payload-hash-abc") while
// rejecting accidental matches.
const confirmationPattern = /^(?:confirm|approve|delete)\b/;
const requiredConfirmation = z.preprocess((value) => String(value ?? "").trim().toLowerCase(), z.string().refine((value) => confirmationPattern.test(value), "Explicit owner confirmation is required."));
const optionalTrimmedText = z.preprocess((value) => {
  if (value === null || value === undefined) return null;
  const trimmed = String(value).trim();
  return trimmed.length > 0 ? trimmed : null;
}, z.string().max(2_000).nullable());

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

// SCA-495 (W-16): discriminated union so the schema-level shape mirrors the
// X OAuth callback contract. The prior all-optional object pushed the
// {code,state} / {error} branching into the route handler — defense-in-depth
// only if both layers stay in sync.
export const xOAuthCallbackQuerySchema = z.union([
  z.object({
    code: z.string().trim().min(1).max(2_048),
    state: z.string().trim().min(1).max(160),
    error: z.string().optional(),
    error_description: z.string().optional(),
  }),
  z.object({
    error: z.string().trim().min(1).max(120),
    error_description: z.string().trim().min(1).max(500).optional(),
    code: z.string().optional(),
    state: z.string().optional(),
  }),
]);

export const xDisconnectSchema = z.object({
  delete_imported_posts: booleanish.default(false),
  delete_snapshots: booleanish.default(false),
});

export const xReadSyncSchema = z.object({
  include_metrics: booleanish.default(true),
  max_posts: z.coerce.number().int().min(1).max(100).optional().default(25),
  mode: z.enum(["live", "mock"]).optional().default("live"),
});

export const xScopeEscalationSchema = z
  .object({
    reason: z.string().trim().min(10).max(500),
    requested_scopes: z.preprocess((value) => {
      if (Array.isArray(value)) return value;
      return String(value ?? "")
        .split(/\s+/)
        .map((scope) => scope.trim())
        .filter(Boolean);
    }, z.array(z.enum(["tweet.write", "media.write"])).min(1).max(2)),
    return_to: oauthReturnTarget,
  })
  .transform((value) => ({
    reason: value.reason,
    requestedScopes: [...new Set(value.requested_scopes)],
    returnTo: value.return_to,
  }));

// SCA-494 (W-15): discriminated union so confirmation is REQUIRED at the
// schema level when dry_run is false. The prior optional+superRefine shape
// produced the same rejection behavior but relied on the refinement firing
// AFTER all other parsing; future maintenance that loosened the refine or
// re-ordered the booleanish coercion would have silently regressed the
// strongest "no live publish without confirmation" invariant.
export const xPublishSchema = z
  .union([
    z.object({
      confirmation: requiredConfirmation.optional(),
      dry_run: booleanish.transform((value, ctx) => {
        if (value !== true) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: "dry_run must be true for the dry-run branch." });
          return z.NEVER;
        }
        return true;
      }),
      payload_hash: optionalTrimmedText.optional(),
      publishing_draft_id: z.string().trim().min(1),
    }),
    z.object({
      confirmation: requiredConfirmation,
      dry_run: booleanish.transform((value, ctx) => {
        if (value !== false) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: "dry_run must be false for the live publish branch." });
          return z.NEVER;
        }
        return false;
      }),
      payload_hash: optionalTrimmedText.optional(),
      publishing_draft_id: z.string().trim().min(1),
    }),
  ])
  .transform((value) => ({
    confirmation: value.confirmation ?? null,
    dryRun: value.dry_run,
    payloadHash: value.payload_hash ?? null,
    publishingDraftId: value.publishing_draft_id,
  }));

export const xDeleteOwnPostSchema = z
  .object({
    confirmation: requiredConfirmation,
    platform_post_id: z.string().trim().regex(/^[0-9]{1,19}$/),
  })
  .transform((value) => ({
    confirmation: value.confirmation,
    platformPostId: value.platform_post_id,
  }));

export function formDataToXRecord(formData: FormData) {
  return Object.fromEntries(formData.entries());
}
