import { SettingsSectionPage } from "@/components/settings";
import { getOperationalDiagnostics } from "@/lib/server-only/diagnostics";

export const dynamic = "force-dynamic";

export default function AiSettingsPage() {
  const diagnostics = getOperationalDiagnostics();

  return (
    <SettingsSectionPage
      actions={[
        {
          href: "/api/ai/diagnostics",
          label: "Open AI diagnostics",
          note: "Protected endpoint returns provider readiness, prompt registry, and rate-limit defaults.",
          tone: "secondary",
        },
      ]}
      description="Server-only AI readiness, provider routing, prompt registry, structured-output validation, and run logging. Provider keys stay redacted and AI calls remain server-side only."
      diagnostics={diagnostics}
      folio="§ 20"
      groupIds={["ai", "security"]}
      introRows={[
        { label: "Provider calls", value: "Server-only Anthropic, optional OpenAI, and mock adapters are available" },
        { label: "Prompt safety", value: "External content is wrapped as untrusted data and validated with Zod outputs" },
        { label: "Run logs", value: "ai_jobs and prompt_runs persist with admin context or no-op safely in dev" },
      ]}
      title="AI Settings"
    />
  );
}
