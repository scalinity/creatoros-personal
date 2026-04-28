"use client";

import { Button, ErrorFallback } from "@/components/design-system";

import "./globals.css";

type GlobalErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
  unstable_retry?: () => void;
};

export default function GlobalError({ reset, unstable_retry }: GlobalErrorProps) {
  const retry = unstable_retry ?? reset;

  return (
    <html lang="en">
      <body>
        <main className="route-scaffold">
          <ErrorFallback
            action={
              <Button onClick={retry} variant="secondary">
                Retry shell
              </Button>
            }
            code="§ E00"
            message="A global rendering failure occurred before the workstation shell could mount. Details are intentionally withheld from the browser."
            title="Global boundary tripped"
          />
        </main>
      </body>
    </html>
  );
}