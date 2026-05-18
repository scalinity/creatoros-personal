// M-3: Next.js boot-time instrumentation. Validates the server env schema
// once on cold start so misconfiguration fails LOUD at boot instead of
// surfacing on the first request that needs a particular variable. The
// validation is non-fatal — it logs a structured warning so the operator
// sees missing keys in deploy logs while the app continues to run for paths
// that do not require them (e.g. /login, diagnostics).
//
// References:
//   * docs/FINAL_CODEBASE_REVIEW.md M-3
//   * lib/env/schema.ts: serverEnvSchema, getServerEnvDiagnostics
//
// Next.js calls register() exactly once when the server starts.

export async function register() {
  // Lazy-import to keep instrumentation cheap when the runtime is wrong (e.g.
  // Edge runtime where some Node-only APIs are not available).
  if (process.env.NEXT_RUNTIME !== "nodejs") {
    return;
  }

  try {
    const { getServerEnvDiagnostics } = await import("@/lib/env/schema");
    const diagnostics = getServerEnvDiagnostics(process.env);

    if (diagnostics.valid) {
      console.info("[creatoros] env boot validation: OK", {
        checked_count: diagnostics.checked.length,
      });
      return;
    }

    // Logged at warn level (not error) because some local-dev workflows
    // intentionally run without every required key, and we don't want to
    // stop the process on first boot. Production deployments should treat
    // this warning as a release-gate.
    console.warn("[creatoros] env boot validation: incomplete", {
      invalid: diagnostics.invalid,
      missing: diagnostics.missing,
    });
  } catch (error) {
    console.error("[creatoros] env boot validation threw", {
      reason: error instanceof Error ? error.message : "unknown",
    });
  }
}
