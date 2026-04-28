export type RetryOptions = {
  externalSignal?: AbortSignal;
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

function wait(ms: number) {
  if (ms <= 0) {
    return Promise.resolve();
  }

  return new Promise((resolve) => setTimeout(resolve, ms));
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

      await wait(options.retryDelayMs ?? 0);
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Provider call failed.");
}
