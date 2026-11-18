import type { Middleware } from "./index.js";
import { HttpError } from "../errors/index.js";

export interface RetryMiddlewareOptions {
  /** Maximum number of attempts before giving up (default `3`). Must be >= 1. */
  maxAttempts?: number;
  /** HTTP status codes that are retried (default: `408, 429, 500, 502, 503, 504`). */
  retryableStatuses?: readonly number[];
  /** Base delay in milliseconds (default `500`). */
  delay?: number;
  /**
   * Backoff strategy: `"fixed"`, `"exponential"` (default) or a function
   * `(attempt, response?) => delayMs`.
   */
  backoff?:
    | "fixed"
    | "exponential"
    | ((attempt: number, response?: Response) => number);
  /**
   * Decide whether to retry after an error or non-ok response.
   * Return `false` to stop retrying. Default: always retry until `maxAttempts`.
   */
  shouldRetry?: (
    error: Error,
    attempt: number,
    response?: Response,
  ) => boolean | undefined;
  /** Invoked before each retry with the attempt number, error and last response. */
  onRetry?: (attempt: number, error: Error, response?: Response) => void;
}

/**
 * Retry middleware: repeats requests that fail with retryable network errors or
 * retryable HTTP statuses. The last attempt always surfaces its error or
 * non-ok response to the caller (so `HttpError.status` stays accurate).
 */
export function retryMiddleware(opts: RetryMiddlewareOptions = {}): Middleware {
  const maxAttempts = Math.max(1, opts.maxAttempts ?? 3);
  const retryableStatuses = new Set(
    opts.retryableStatuses ?? [408, 429, 500, 502, 503, 504],
  );
  const baseDelay = opts.delay ?? 500;
  const backoff = opts.backoff ?? "exponential";

  return async (ctx, next) => {
    let lastError: Error | undefined;
    let lastResponse: Response | undefined;

    for (let attempt = 1; ; attempt++) {
      let response: Response;
      try {
        response = await next();
      } catch (error) {
        lastError = error as Error;
        lastResponse =
          (error as { response?: Response }).response ?? lastResponse;
        if (attempt >= maxAttempts) throw error;
        const status = (error as { status?: number }).status;
        if (status !== undefined && !retryableStatuses.has(status)) throw error;
        if (opts.shouldRetry?.(lastError, attempt, lastResponse) === false) {
          throw lastError;
        }
        opts.onRetry?.(attempt, lastError, lastResponse);
        await sleep(computeDelay(attempt, lastResponse, baseDelay, backoff));
        continue;
      }

      lastResponse = response;
      if (response.ok) return response;
      if (!retryableStatuses.has(response.status)) {
        // Non-retryable status: surface it immediately instead of retrying.
        throw new HttpError(response, { endpoint: ctx.label });
      }
      lastError = new Error(`HTTP ${response.status}`, { cause: response });
      if (attempt >= maxAttempts) {
        return response;
      }
      if (opts.shouldRetry?.(lastError, attempt, response) === false) {
        return response;
      }
      opts.onRetry?.(attempt, lastError, response);
      await sleep(computeDelay(attempt, response, baseDelay, backoff));
    }
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function computeDelay(
  attempt: number,
  response: Response | undefined,
  baseDelay: number,
  backoff: RetryMiddlewareOptions["backoff"],
): number {
  const raw =
    typeof backoff === "function"
      ? backoff(attempt, response)
      : backoff === "fixed"
        ? baseDelay
        : baseDelay * Math.pow(2, attempt - 1);
  return Math.max(0, Math.floor(raw));
}
