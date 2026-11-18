import { isEndpoint } from "../definition/index.js";
import { ConfigurationError, RegistryError } from "../errors/index.js";
import { execute } from "../executor/index.js";
import type { LooseInput, RegistryContext } from "../executor/index.js";
import type { Middleware } from "../middleware/index.js";
import type { FetchLike } from "../transport/index.js";
import type { HeadersSource, Registry, RegistryTree } from "../types/index.js";

export interface RegistryOptions {
  /** Default base URL. Endpoint-level `baseUrl` wins. In browsers, falls back to the page origin. */
  baseUrl?: string;
  /** Headers applied to every endpoint (merged first; endpoint and call headers override). */
  headers?: HeadersSource;
  /** Custom transport. Defaults to the global `fetch`. Handy for tests and local dev. */
  fetch?: FetchLike;
  /** Onion middleware; first item is outermost. */
  middleware?: readonly Middleware[];
  /** Default timeout in ms. Per-call `timeoutMs` overrides. No default timeout is applied. */
  timeoutMs?: number;
  credentials?: RequestCredentials;
  redirect?: RequestRedirect;
}

const MAX_DEPTH = 32;

export function isPlainTree(value: unknown): value is RegistryTree {
  if (typeof value !== "object" || value === null || isEndpoint(value))
    return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function build(
  node: RegistryTree,
  path: readonly string[],
  ctx: RegistryContext,
): Record<string, unknown> {
  if (path.length > MAX_DEPTH) {
    throw new RegistryError(
      `Registry nesting is deeper than ${MAX_DEPTH} levels (circular reference?)`,
      {
        path: path.join("."),
      },
    );
  }
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(node)) {
    const here = [...path, key];
    if (key === "" || key === "__proto__") {
      throw new RegistryError(`Invalid name "${key}" at "${here.join(".")}"`, {
        path: here.join("."),
      });
    }
    const value = node[key];
    if (isEndpoint(value)) {
      const call = (input?: LooseInput) =>
        execute(value, input ?? {}, ctx, here);
      Object.defineProperty(call, "endpoint", { value, enumerable: true });
      out[key] = Object.freeze(call);
    } else if (isPlainTree(value)) {
      out[key] = build(value, here, ctx);
    } else {
      throw new RegistryError(
        `Invalid entry at "${here.join(".")}": expected an endpoint (defineEndpoint) or a group of endpoints`,
        { path: here.join(".") },
      );
    }
  }
  return Object.freeze(out);
}

/**
 * Creates an isolated registry. No global state is shared between instances.
 * `api.users.get({ params: { id: 1 } })` builds, sends and parses the request.
 */
export function createRegistry<const T extends RegistryTree>(
  tree: T,
  options: RegistryOptions = {},
): Registry<T> {
  if (!isPlainTree(tree))
    throw new RegistryError("createRegistry() expects an object of endpoints");
  const middleware = options.middleware ?? [];
  if (
    !Array.isArray(middleware) ||
    middleware.some((m) => typeof m !== "function")
  ) {
    throw new ConfigurationError("middleware must be an array of functions");
  }
  const { middleware: _ignored, ...rest } = options;
  void _ignored;
  const ctx: RegistryContext = Object.freeze({
    ...rest,
    middleware: Object.freeze([...middleware]),
  });
  return build(tree, [], ctx) as Registry<T>;
}
