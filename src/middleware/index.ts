import { ConfigurationError } from "../errors/index.js";
import type { AnyEndpoint } from "../types/index.js";

export interface MiddlewareContext {
  readonly request: Request;
  readonly endpoint: AnyEndpoint;
  /** Position in the registry, e.g. ["users", "get"]. */
  readonly path: readonly string[];
  /** "GET /users/:id" (safe to log). */
  readonly label: string;
}

export type Next = (request?: Request) => Promise<Response>;

/**
 * Onion model. The first middleware in the array is the outermost.
 * Call `next()` (optionally with a replacement Request) to continue,
 * or return a Response without calling `next()` to short-circuit.
 * Errors thrown here propagate unchanged.
 */
export type Middleware = (
  ctx: MiddlewareContext,
  next: Next,
) => Response | Promise<Response>;

export function runMiddleware(
  chain: readonly Middleware[],
  ctx: MiddlewareContext,
  terminal: (request: Request) => Promise<Response>,
): Promise<Response> {
  const dispatch = (index: number, request: Request): Promise<Response> => {
    const middleware = chain[index];
    if (!middleware) return terminal(request);
    let called = false;
    const next: Next = (replacement) => {
      if (called) {
        return Promise.reject(
          new ConfigurationError("Middleware called next() more than once", {
            endpoint: ctx.label,
          }),
        );
      }
      called = true;
      return dispatch(index + 1, replacement ?? request);
    };
    try {
      return Promise.resolve(middleware({ ...ctx, request }, next));
    } catch (error) {
      return Promise.reject(error);
    }
  };
  return dispatch(0, ctx.request);
}

const SENSITIVE = new Set([
  "authorization",
  "proxy-authorization",
  "cookie",
  "set-cookie",
  "x-api-key",
]);

/** Returns header entries with sensitive values replaced by "[redacted]". Use before logging. */
export function redactHeaders(headers: Headers): Record<string, string> {
  const out: Record<string, string> = {};
  headers.forEach((value, key) => {
    out[key] = SENSITIVE.has(key.toLowerCase()) ? "[redacted]" : value;
  });
  return out;
}
