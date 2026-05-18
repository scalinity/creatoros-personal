"use client";

import { useRef, useState } from "react";

import { Button } from "@/components/design-system";

// SCA-528 (S-22): the prior version flipped copied=true and never back, so
// the button stayed "Copied" until reload. Reset after 2s via a tracked
// timeout so the UI returns to the resting state. The ref pattern avoids
// reaching for useEffect (CLAUDE.md global rules) — we own the lifecycle
// of a one-shot setTimeout.
const COPIED_RESET_MS = 2_000;

export function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const resetTimerRef = useRef<null | ReturnType<typeof setTimeout>>(null);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
      resetTimerRef.current = setTimeout(() => setCopied(false), COPIED_RESET_MS);
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
