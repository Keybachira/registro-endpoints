import { DefinitionError } from "../errors/index.js";
import { ENDPOINT_BRAND, HTTP_METHODS } from "../types/index.js";
import type {
  AnyEndpoint,
  Endpoint,
  EndpointDefinition,
  HttpMethod,
} from "../types/index.js";
import { isSchema } from "../validation/index.js";
import type { AnySchema } from "../validation/index.js";

const PARAM_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

export function isEndpoint(value: unknown): value is AnyEndpoint {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as Record<symbol, unknown>)[ENDPOINT_BRAND] === true
  );
}

export function endpointLabel(endpoint: {
  method: string;
  path: string;
}): string {
  return `${endpoint.method} ${endpoint.path}`;
}

/** Names of `:param` segments in a path template. Whole-segment params only. */
export function pathParamNames(path: string): string[] {
  return path
    .split("/")
    .filter((s) => s.startsWith(":"))
    .map((s) => s.slice(1));
}

/**
 * Creates an immutable endpoint definition. Never performs a request.
 * Types for query/body/response are inferred from the schemas (use `typed<T>()` for type-only).
 */
export function defineEndpoint<
  const M extends HttpMethod,
  const P extends string,
  Q = unknown,
  B = unknown,
  R = unknown,
>(definition: EndpointDefinition<M, P, Q, B, R>): Endpoint<M, P, Q, B, R> {
  if (typeof definition !== "object" || definition === null) {
    throw new DefinitionError("defineEndpoint() expects an object");
  }
  const {
    method,
    path,
    baseUrl,
    headers,
    query,
    body,
    responseSchema,
    metadata,
  } = definition;

  if (!HTTP_METHODS.includes(method)) {
    throw new DefinitionError(
      `Invalid HTTP method: ${String(method)}. Use one of ${HTTP_METHODS.join(", ")}`,
    );
  }
  if (typeof path !== "string" || !path.startsWith("/")) {
    throw new DefinitionError(
      `Endpoint path must be a string starting with "/": ${String(path)}`,
    );
  }
  if (path.includes("?") || path.includes("#")) {
    throw new DefinitionError(
      `Endpoint path must not contain "?" or "#": ${path}. Use the query option.`,
    );
  }
  const names = pathParamNames(path);
  for (const name of names) {
    if (!PARAM_NAME.test(name)) {
      throw new DefinitionError(
        `Invalid path parameter name ":${name}" in ${path}`,
      );
    }
  }
  if (new Set(names).size !== names.length) {
    throw new DefinitionError(`Duplicate path parameter in ${path}`);
  }
  if (baseUrl !== undefined && typeof baseUrl !== "string") {
    throw new DefinitionError("baseUrl must be a string");
  }
  if (
    headers !== undefined &&
    typeof headers !== "function" &&
    (typeof headers !== "object" || headers === null)
  ) {
    throw new DefinitionError("headers must be an object or a function");
  }
  for (const [key, schema] of [
    ["query", query],
    ["body", body],
    ["responseSchema", responseSchema],
  ] as const) {
    if (schema !== undefined && !isSchema(schema as AnySchema<unknown>)) {
      throw new DefinitionError(
        `${key} must be a schema (an object with parse() or "~standard")`,
        {
          endpoint: `${method} ${path}`,
        },
      );
    }
  }
  if ((method === "GET" || method === "HEAD") && body !== undefined) {
    throw new DefinitionError(`${method} endpoints cannot declare a body`, {
      endpoint: `${method} ${path}`,
    });
  }

  const endpoint: Endpoint<M, P, Q, B, R> = {
    [ENDPOINT_BRAND]: true,
    method,
    path,
    ...(baseUrl !== undefined && { baseUrl }),
    ...(headers !== undefined && { headers }),
    ...(query !== undefined && { query }),
    ...(body !== undefined && { body }),
    ...(responseSchema !== undefined && { responseSchema }),
    ...(metadata !== undefined && { metadata: Object.freeze({ ...metadata }) }),
  };
  return Object.freeze(endpoint);
}
