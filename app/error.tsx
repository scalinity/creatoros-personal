"use client";

import { Button, ErrorFallback } from "@/components/design-system";

type ErrorBoundaryProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function RootError({ error, reset }: ErrorBoundaryProps) {
  const digest = error.digest;

  return (
    <main className="route-scaffold">
      <ErrorFallback
        action={
          <Button onClick={reset} variant="secondary">
            Retry workspace
          </Button>
        }
        code={digest ? `§ E23 · ${digest}` : "§ E23"}
        message="The workspace failed to render. This boundary returns a redacted recovery surface and does not expose private data, tokens, or provider details."
        title="Workspace boundary tripped"
      />
    </main>
  );
}
