"use client";

import { Button, ErrorFallback } from "@/components/design-system";

export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="route-scaffold">
      <ErrorFallback
        action={<Button onClick={reset} variant="secondary">Retry route shell</Button>}
        code="§ E04"
        message="The private workstation route failed to render. No feature data or secrets are exposed by this fallback."
        title="Route shell failed"
      />
    </main>
  );
}
