import "server-only";

// Re-throw redirect signals so a success-path `redirect()` is not silently
// converted into a *_failed notice by a surrounding catch block. Next.js's
// `redirect()` works by throwing an error with a `NEXT_REDIRECT;...` digest;
// the framework intercepts it at a higher boundary, but local catch blocks
// would otherwise swallow it. We avoid the internal `next/dist/.../redirect-
// error` import path by checking the digest shape inline.
export function rethrowIfRedirect(error: unknown): void {
  if (
    error &&
    typeof error === "object" &&
    "digest" in error &&
    typeof (error as { digest: unknown }).digest === "string" &&
    (error as { digest: string }).digest.startsWith("NEXT_REDIRECT")
  ) {
    throw error;
  }
}
