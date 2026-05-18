export type RetryOptions = {
  externalSignal?: AbortSignal;
  // M-11: per-attempt callback fires with the failing attempt number (1-indexed)
  // and the error so callers can persist a per-attempt prompt_run row before
  // the next retry runs. Without this, only the final attempt's usage was ever
  // logged — earlier attempts silently consumed tokens without an audit trail.
  //
  // SEMANTICS: this is `onRetry`, not `onAttemptFailure`. It fires *only* when
  // another attempt is about to be scheduled, NOT when the final attempt fails.
  // The terminal failure flows back to the caller's catch (e.g. lib/ai/run.ts
  // catches and persists a `status: "failed"` prompt_run row). Together they
  // log every attempt; on its own, this callback would miss the last one.
  onRetry?: (attempt: number, error: unknown) => void | Promise<void>;
  retryDelayMs?: number;
  retries: number;
  timeoutMs: number;
};

export class AiProviderTimeoutError extends Error {
  readonly code = "provider_timeout";

  constructor(timeoutMs: number) {
    super(`Provider call timed out after ${timeoutMs}ms.`);
    this.name = "AiProviderTimeoutError";
  }
}

function wait(ms: number, signal?: AbortSignal) {
  if (ms <= 0) {
    return Promise.resolve();
  }

  if (signal?.aborted) {
    return Promise.resolve();
  }

  return new Promise<void>((resolve) => {
    const timeout = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);

    const onAbort = () => {
      clearTimeout(timeout);
      resolve();
    };

    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function abortError(externalSignal?: AbortSignal) {
  const reason = externalSignal?.reason;
  return reason instanceof Error ? reason : new Error("Provider call aborted.");
}

async function runWithTimeout<T>(operation: (signal: AbortSignal) => Promise<T>, timeoutMs: number, externalSignal?: AbortSignal) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const abortFromExternal = () => controller.abort(externalSignal?.reason);

  if (externalSignal?.aborted) {
    abortFromExternal();
  } else {
    externalSignal?.addEventListener("abort", abortFromExternal, { once: true });
  }

  try {
    if (controller.signal.aborted) {
      throw abortError(externalSignal);
    }

    return await Promise.race([
      operation(controller.signal),
      new Promise<never>((_, reject) => {
        controller.signal.addEventListener(
          "abort",
          () => reject(externalSignal?.aborted ? abortError(externalSignal) : new AiProviderTimeoutError(timeoutMs)),
          { once: true },
        );
      }),
    ]);
  } finally {
    externalSignal?.removeEventListener("abort", abortFromExternal);
    clearTimeout(timeout);
  }
}

export async function withRetryAndTimeout<T>(operation: (signal: AbortSignal) => Promise<T>, options: RetryOptions): Promise<T> {
  let lastError: unknown;
  const attempts = Math.max(1, options.retries + 1);

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await runWithTimeout(operation, options.timeoutMs, options.externalSignal);
    } catch (error) {
      lastError = error;

      if (options.externalSignal?.aborted) {
        throw abortError(options.externalSignal);
      }

      if (attempt >= attempts - 1) {
        break;
      }

      // M-11: surface the failing attempt to the caller before scheduling the
      // next retry. The caller can log a per-attempt prompt_run row.
      if (options.onRetry) {
        try {
          await options.onRetry(attempt + 1, error);
        } catch (callbackError) {
          // Don't let a logging failure abort the retry loop.
          console.error("retry onRetry callback failed", { reason: callbackError instanceof Error ? callbackError.message : "unknown" });
        }
      }

      // Pass the external signal so the wait wakes up immediately on abort,
      // preventing a doomed retry from being scheduled after the consumer has
      // already given up.
      await wait(options.retryDelayMs ?? 0, options.externalSignal);

      if (options.externalSignal?.aborted) {
        throw abortError(options.externalSignal);
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Provider call failed.");
}
