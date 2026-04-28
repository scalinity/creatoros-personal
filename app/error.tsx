"use client";

import { Button, ErrorFallback } from "@/components/design-system";

type ErrorBoundaryProps = {
  error: Error & { digest?: string };
  reset: () => void;
  unstable_retry?: () => void;
};

export default function RootError({ reset, unstable_retry }: ErrorBoundaryProps) {
  const retry = unstable_retry ?? reset;

  return (
    <main className="route-scaffold">
      <ErrorFallback
        action={
          <Button onClick={retry} variant="secondary">
            Retry workspace
          </Button>
        }
        code="§ E23"
        message="The workspace failed to render. This boundary returns a redacted recovery surface and does not expose private data, tokens, or provider details."
        title="Workspace boundary tripped"
      />
    </main>
  );
}