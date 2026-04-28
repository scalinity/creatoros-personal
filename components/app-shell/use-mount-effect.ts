"use client";

import { useEffect } from "react";

export function useMountEffect(effect: () => void | (() => void)) {
  // External keyboard listeners need mount/cleanup synchronization; route state stays derived elsewhere.
  // eslint-disable-next-line react-hooks/exhaustive-deps -- this named wrapper is intentionally mount-only.
  useEffect(effect, []);
}
