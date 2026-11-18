import { endpointLabel } from "../definition/index.js";
import {
  AbortedError,
  ConfigurationError,
  EndpointRegistryError,
  HttpError,
  NetworkError,
  RequestValidationError,
  ResolutionError,
  ResponseParseError,
  ResponseValidationError,
  TimeoutError,
} from "../errors/index.js";
import { runMiddleware } from "../middleware/index.js";
import type { Middleware } from "../middleware/index.js";
import { buildUrl, resolvePath } from "../resolver/index.js";
import { locationOrigin, resolveTransport } from "../transport/index.js";
import type { FetchLike } from "../transport/index.js";
import type {
  AnyEndpoint,
  CallOptions,
  HeaderValues,
  HeadersSource,
  ParseAs,
  PathParamValue,
  QueryParams,
} from "../types/index.js";
import { runSchema } from "../validation/index.js";

export interface RegistryContext {
  readonly baseUrl?: string;
  readonly headers?: HeadersSource;
  readonly fetch?: FetchLike;
  readonly middleware: readonly Middleware[];
  readonly timeoutMs?: number;
  readonly credentials?: RequestCredentials;
  readonly redirect?: RequestRedirect;
}

export interface LooseInput extends CallOptions {
  params?: Readonly<Record<string, PathParamValue>> | undefined;
  query?: QueryParams | undefined;
  body?: unknown;
}

function isInstance(name: string, value: unknown): boolean {
  const ctor = (globalThis as Record<string, unknown>)[name];
  return (
    typeof ctor === "function" &&
    value instanceof (ctor as new (...args: never[]) => unknown)
  );
}

async function collectHeaders(
  headers: Headers,
  source: HeadersSource | undefined,
): Promise<void> {
  if (!source) return;
  const values: HeaderValues =
    typeof source === "function" ? await source() : source;
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) headers.delete(key);
    else headers.set(key, value);
  }
}

/** Returns a BodyInit. FormData / URLSearchParams get their Content-Type from fetch itself. */
function encodeBody(body: unknown, headers: Headers): BodyInit | undefined {
  if (body === undefined) return undefined;
  if (
    typeof body === "string" ||
    isInstance("FormData", body) ||
    isInstance("URLSearchParams", body) ||
    isInstance("Blob", body) ||
    isInstance("ArrayBuffer", body) ||
    ArrayBuffer.isView(body)
  ) {
    return body as BodyInit;
  }
  let json: string | undefined;
  try {
    json = JSON.stringify(body);
  } catch (error) {
    throw new ResolutionError("Request body is not JSON-serializable", {
      cause: error,
    });
  }
  if (json === undefined)
    throw new ResolutionError("Request body is not JSON-serializable");
  if (!headers.has("content-type"))
    headers.set("content-type", "application/json");
  return json;
}

async function parseResponse(
  response: Response,
  parseAs: ParseAs,
  method: string,
): Promise<unknown> {
  if (
    method === "HEAD" ||
    response.status === 204 ||
    response.status === 205 ||
    response.status === 304
  ) {
    return undefined;
  }
  const readJson = async (): Promise<unknown> => {
    const text = await response.text();
    if (text.trim() === "") return undefined;
    try {
      return JSON.parse(text);
    } catch (error) {
      throw new ResponseParseError("Response body is not valid JSON", {
        cause: error,
      });
    }
  };
  switch (parseAs) {
    case "json":
      return readJson();
    case "text":
      return response.text();
    case "blob":
      return response.blob();
    case "arrayBuffer":
      return response.arrayBuffer();
    default: {
      const type = (response.headers.get("content-type") ?? "").toLowerCase();
      if (/(^|[/+])json(\s*;|$)/.test(type)) return readJson();
      if (
        type === "" ||
        type.startsWith("text/") ||
        type.includes("xml") ||
        type.includes("x-www-form-urlencoded")
      ) {
        const text = await response.text();
        return text === "" ? undefined : text;
      }
      return response.blob();
    }
  }
}

function withEndpoint(error: unknown, label: string): unknown {
  if (error instanceof ResolutionError && !error.endpoint) {
    return new ResolutionError(error.message, {
      cause: error.cause,
      endpoint: label,
    });
  }
  if (error instanceof ConfigurationError && !error.endpoint) {
    return new ConfigurationError(error.message, {
      cause: error.cause,
      endpoint: label,
    });
  }
  return error;
}

export async function execute(
  endpoint: AnyEndpoint,
  input: LooseInput,
  ctx: RegistryContext,
  path: readonly string[],
): Promise<unknown> {
  const label = endpointLabel(endpoint);
  const errCtx = { endpoint: label };

  // 1. validate input
  let query: unknown = input.query;
  if (endpoint.query) {
    const r = await runSchema(endpoint.query, query);
    if (!r.ok) throw new RequestValidationError("query", r.issues, errCtx);
    query = r.value;
  }
  let body: unknown = input.body;
  if (endpoint.body) {
    const r = await runSchema(endpoint.body, body);
    if (!r.ok) throw new RequestValidationError("body", r.issues, errCtx);
    body = r.value;
  }

  // 2. resolve URL, headers, body
  const timeoutMs = input.timeoutMs ?? ctx.timeoutMs;
  if (
    timeoutMs !== undefined &&
    (!Number.isFinite(timeoutMs) || timeoutMs <= 0)
  ) {
    throw new ConfigurationError(
      "timeoutMs must be a positive finite number",
      errCtx,
    );
  }
  const headers = new Headers();
  let url: string;
  let encoded: BodyInit | undefined;
  try {
    const baseUrl = endpoint.baseUrl ?? ctx.baseUrl ?? locationOrigin();
    if (!baseUrl) {
      throw new ConfigurationError(
        "No baseUrl. Set it on the endpoint or in createRegistry({ baseUrl }). In browsers, the page origin is used as a fallback.",
      );
    }
    url = buildUrl(
      baseUrl,
      resolvePath(endpoint.path, input.params),
      query as QueryParams | undefined,
    );
    await collectHeaders(headers, ctx.headers);
    await collectHeaders(headers, endpoint.headers);
    await collectHeaders(headers, input.headers);
    encoded = encodeBody(body, headers);
  } catch (error) {
    throw withEndpoint(error, label);
  }

  // 3. abort + timeout wiring
  const userSignal = input.signal;
  if (userSignal?.aborted) throw new AbortedError(errCtx);
  const controller = new AbortController();
  let timedOut = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const onUserAbort = () => controller.abort();
  userSignal?.addEventListener("abort", onUserAbort, { once: true });
  if (timeoutMs !== undefined) {
    timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);
  }
  const abortError = (cause: unknown): EndpointRegistryError | undefined => {
    if (timedOut)
      return new TimeoutError(timeoutMs as number, { ...errCtx, cause });
    if (controller.signal.aborted)
      return new AbortedError({ ...errCtx, cause });
    return undefined;
  };
  // Makes adapters that ignore the signal still honor cancellation/timeout.
  const aborted = new Promise<never>((_, reject) => {
    controller.signal.addEventListener(
      "abort",
      () => reject(new Error("aborted")),
      { once: true },
    );
  });
  aborted.catch(() => undefined);

  try {
    let request: Request;
    try {
      request = new Request(url, {
        method: endpoint.method,
        headers,
        ...(encoded !== undefined && { body: encoded }),
        signal: controller.signal,
        ...(ctx.credentials && { credentials: ctx.credentials }),
        ...(ctx.redirect && { redirect: ctx.redirect }),
      });
    } catch (error) {
      throw new ConfigurationError("Could not build the Request", {
        ...errCtx,
        cause: error,
      });
    }

    const transport = resolveTransport(ctx.fetch);
    const terminal = async (req: Request): Promise<Response> => {
      try {
        return await Promise.race([transport(req), aborted]);
      } catch (error) {
        if (error instanceof EndpointRegistryError) throw error;
        throw (
          abortError(error) ?? new NetworkError({ ...errCtx, cause: error })
        );
      }
    };

    // 4. middleware -> transport
    const response = await runMiddleware(
      ctx.middleware,
      { request, endpoint, path, label },
      terminal,
    );

    // 5. process response
    if (!response.ok) throw new HttpError(response, errCtx);
    const parseAs = input.parseAs ?? "auto";
    if (parseAs === "response") return response;

    let data: unknown;
    try {
      data = await parseResponse(response, parseAs, endpoint.method);
    } catch (error) {
      if (error instanceof EndpointRegistryError) throw error;
      throw (
        abortError(error) ??
        new ResponseParseError("Could not read the response body", {
          ...errCtx,
          cause: error,
        })
      );
    }

    // 6. validate output
    if (endpoint.responseSchema) {
      const r = await runSchema(endpoint.responseSchema, data);
      if (!r.ok) throw new ResponseValidationError(r.issues, errCtx);
      return r.value;
    }
    return data;
  } catch (error) {
    if (error instanceof EndpointRegistryError) throw error;
    throw abortError(error) ?? error;
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    userSignal?.removeEventListener("abort", onUserAbort);
  }
}
