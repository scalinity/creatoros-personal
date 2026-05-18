"use client";

import { Button, ErrorFallback } from "@/components/design-system";

import "./globals.css";

type GlobalErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function GlobalError({ error, reset }: GlobalErrorProps) {
  const digest = error.digest;

  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <main className="route-scaffold">
          <ErrorFallback
            action={
              <Button onClick={reset} variant="secondary">
                Retry shell
              </Button>
            }
            code={digest ? `§ E00 · ${digest}` : "§ E00"}
            message="A global rendering failure occurred before the workstation shell could mount. Details are intentionally withheld from the browser."
            title="Global boundary tripped"
          />
        </main>
      </body>
    </html>
  );
}
