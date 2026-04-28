"use client";

import { useState } from "react";

import { Button } from "@/components/design-system";

export function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch (error) {
      console.error("Failed to copy generated text", {
        reason: error instanceof Error ? error.message : "unknown",
      });
      setCopied(false);
    }
  }

  return (
    <Button onClick={handleCopy} size="sm" type="button" variant="secondary">
      {copied ? "Copied" : "Copy"}
    </Button>
  );
}
