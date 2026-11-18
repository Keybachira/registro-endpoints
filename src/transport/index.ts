import { ConfigurationError } from "../errors/index.js";

/** Transport contract (decision D1): accepts a Web Request, returns a Web Response. */
export type FetchLike = (request: Request) => Promise<Response>;

export function resolveTransport(custom: FetchLike | undefined): FetchLike {
  if (custom) return custom;
  const g = globalThis as { fetch?: (input: Request) => Promise<Response> };
  if (typeof g.fetch !== "function") {
    throw new ConfigurationError(
      "No fetch implementation found. Pass `fetch` in createRegistry() options.",
    );
  }
  return (request) =>
    (globalThis as unknown as { fetch: FetchLike }).fetch(request);
}

/** Local-dev fallback: same-origin base URL when running in a browser-like environment. */
export function locationOrigin(): string | undefined {
  const loc = (globalThis as { location?: { origin?: unknown } }).location;
  return typeof loc?.origin === "string" && loc.origin !== "null"
    ? loc.origin
    : undefined;
}
