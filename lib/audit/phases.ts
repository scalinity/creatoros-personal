// SCA-525 (S-19): central phase-marker registry. Each module previously
// declared its own `const PHASE = "15-..."` string — audit-log queries that
// group by metadata.phase relied on every author getting the string right.
// Importing from here gives editors autocomplete + a single source of truth
// when phases evolve.

export const PHASES = {
  authFoundation: "07-private-auth-admin-gate-audit",
  settingsDiagnostics: "08-settings-diagnostics-environment-security",
  scoringImportsPostHistory: "09-scoring-imports-post-history",
  composerBase: "10-content-ideas-generated-outputs-composer-base",
  aiFoundation: "11-ai-foundation-prompt-registry-structured-outputs",
  algoAndBrainDump: "12-algorithm-analyzer-brain-dump-transformer",
  voiceAndEmbeddings: "13-voice-modeling-and-embeddings-foundation",
  blogs: "14-blog-system",
  publishingStateMachine: "15-publishing-state-machine-dry-run-calendar",
  xOAuthAndReadSync: "16-x-oauth-and-read-sync",
  xPublishingAdapter: "17-x-write-publishing-adapter",
  analyticsAndDashboards: "18-analytics-dashboard-and-reports",
  coachRetrievalAndPlaybooks: "19-coach-retrieval-and-content-playbooks",
  inspirationAndExtension: "20-inspiration-library-and-extension-save-token",
  replyGuyAndAccountResearch: "21-reply-guy-account-research",
  growthSystem: "22-growth-system-campaigns-experiments-reviews",
  hardeningExportDeleteObservability: "23-hardening-export-delete-observability",
  testingAndE2e: "24-testing-and-e2e-coverage",
  finalProductionReview: "25-final-production-review",
  reviewHardening: "26-review-hardening",
} as const;

export type PhaseKey = keyof typeof PHASES;
export type PhaseMarker = (typeof PHASES)[PhaseKey];
