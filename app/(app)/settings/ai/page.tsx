import { VoiceProfilePanel } from "@/components/settings/voice-profile-panel";
import { SettingsSectionPage } from "@/components/settings";
import { requireAdmin } from "@/lib/auth/admin";
import { loadEmbeddingStatus } from "@/lib/embeddings";
import { getOperationalDiagnostics } from "@/lib/server-only/diagnostics";
import { loadVoiceProfileStatus } from "@/lib/voice";

import { recomputeVoiceProfileAction, refreshEmbeddingsAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function AiSettingsPage({ searchParams }: { searchParams?: Promise<{ notice?: string }> }) {
  const admin = await requireAdmin();
  const diagnostics = getOperationalDiagnostics();
  const params = searchParams ? await searchParams : {};
  const [voiceStatus, embeddingStatus] = await Promise.all([
    loadVoiceProfileStatus(admin),
    loadEmbeddingStatus(admin),
  ]);

  return (
    <SettingsSectionPage
      actions={[
        {
          href: "/api/ai/diagnostics",
          label: "Open AI diagnostics",
          note: "Protected endpoint returns provider readiness, prompt registry, and rate-limit defaults.",
          tone: "secondary",
        },
        {
          href: "/api/voice-profile",
          label: "Open voice profile status",
          note: "Protected endpoint returns active voice profile and retrieval readiness without source secrets.",
          tone: "secondary",
        },
      ]}
      description="Server-only AI readiness, provider routing, prompt registry, voice modeling, embeddings, structured-output validation, and run logging. Provider keys stay redacted and AI calls remain server-side only."
      diagnostics={diagnostics}
      folio="§ 20"
      groupIds={["ai", "security"]}
      introRows={[
        { label: "Provider calls", value: "Server-only Anthropic, optional OpenAI, and mock adapters are available" },
        { label: "Prompt safety", value: "External content is wrapped as untrusted data and validated with Zod outputs" },
        { label: "Voice model", value: voiceStatus.availableForAiWorkflows ? "Active owner voice profile is available to AI workflows" : "No active profile yet; recompute from owner sources" },
        { label: "Retrieval", value: embeddingStatus.providerAvailable ? "Embedding refresh can use vector search inputs" : "Keyword fallback remains active when embeddings are unavailable" },
        { label: "Run logs", value: "ai_jobs and prompt_runs persist with admin context or no-op safely in dev" },
      ]}
      title="AI Settings"
    >
      <VoiceProfilePanel
        embeddingStatus={embeddingStatus}
        notice={params.notice ?? null}
        recomputeAction={recomputeVoiceProfileAction}
        refreshEmbeddingsAction={refreshEmbeddingsAction}
        status={voiceStatus}
      />
    </SettingsSectionPage>
  );
}
