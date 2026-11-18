import { ConfigurationError, ResolutionError } from "../errors/index.js";
import type {
  PathParamValue,
  QueryParams,
  QueryScalar,
} from "../types/index.js";

function hasOwn(obj: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

function paramToString(name: string, value: unknown): string {
  if (value === null || value === undefined) {
    throw new ResolutionError(`Missing value for path parameter ":${name}"`);
  }
  const t = typeof value;
  let str: string;
  if (t === "string") str = value as string;
  else if (t === "number") {
    if (!Number.isFinite(value as number))
      throw new ResolutionError(
        `Path parameter ":${name}" must be a finite number`,
      );
    str = String(value);
  } else if (t === "boolean" || t === "bigint") str = String(value);
  else
    throw new ResolutionError(
      `Path parameter ":${name}" must be a string, number, boolean or bigint`,
    );
  if (str === "")
    throw new ResolutionError(`Path parameter ":${name}" must not be empty`);
  // encodeURIComponent keeps "." intact; URL normalization would turn these into path traversal.
  if (str === "." || str === "..")
    throw new ResolutionError(
      `Path parameter ":${name}" must not be "." or ".."`,
    );
  return encodeURIComponent(str);
}

/**
 * Substitutes `:name` segments with percent-encoded values.
 * Missing and unexpected parameters throw ResolutionError.
 */
export function resolvePath(
  template: string,
  params: Readonly<Record<string, PathParamValue>> | undefined,
): string {
  const supplied = new Set(params ? Object.keys(params) : []);
  const resolved = template.split("/").map((segment) => {
    if (!segment.startsWith(":")) return segment;
    const name = segment.slice(1);
    supplied.delete(name);
    const value = params && hasOwn(params, name) ? params[name] : undefined;
    return paramToString(name, value);
  });
  if (supplied.size > 0) {
    throw new ResolutionError(
      `Unexpected path parameter(s): ${[...supplied].join(", ")}`,
    );
  }
  return resolved.join("/");
}

function queryScalarToString(key: string, value: unknown): string {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime()))
      throw new ResolutionError(`Query "${key}" is an invalid Date`);
    return value.toISOString();
  }
  switch (typeof value) {
    case "string":
      return value;
    case "number":
      if (!Number.isFinite(value))
        throw new ResolutionError(`Query "${key}" must be a finite number`);
      return String(value);
    case "boolean":
    case "bigint":
      return String(value);
    default:
      throw new ResolutionError(
        `Query "${key}" has an unsupported value type (nested objects are not supported)`,
      );
  }
}

/**
 * Deterministic query serialization (see docs/en/DECISIONS.md):
 * - keys in object insertion order; key and value use encodeURIComponent
 * - undefined: omitted; null: "key=" (empty value)
 * - arrays: repeated key ("a=1&a=2"); null/undefined items follow the scalar rules; empty array: omitted
 * - Date: ISO 8601; nested objects: ResolutionError
 * Returns the string without a leading "?".
 */
export function serializeQuery(query: QueryParams | undefined): string {
  if (!query) return "";
  const parts: string[] = [];
  const push = (key: string, value: QueryScalar | null | undefined) => {
    if (value === undefined) return;
    const k = encodeURIComponent(key);
    parts.push(
      value === null
        ? `${k}=`
        : `${k}=${encodeURIComponent(queryScalarToString(key, value))}`,
    );
  };
  for (const key of Object.keys(query)) {
    const value = query[key];
    if (Array.isArray(value)) for (const item of value) push(key, item);
    else push(key, value as QueryScalar | null | undefined);
  }
  return parts.join("&");
}

/** Joins a base URL and an already-resolved path. Never silently rewrites host or scheme. */
export function joinUrl(baseUrl: string, path: string): string {
  let base: URL;
  try {
    base = new URL(baseUrl);
  } catch (error) {
    throw new ConfigurationError(
      `Invalid baseUrl: ${JSON.stringify(baseUrl)}`,
      { cause: error },
    );
  }
  if (base.protocol !== "http:" && base.protocol !== "https:") {
    throw new ConfigurationError(
      `baseUrl must use http or https, got ${base.protocol}`,
    );
  }
  if (base.search || base.hash) {
    throw new ConfigurationError(
      "baseUrl must not contain a query string or hash",
    );
  }
  if (base.username || base.password) {
    throw new ConfigurationError(
      "baseUrl must not contain credentials; use headers instead",
    );
  }
  return base.origin + base.pathname.replace(/\/+$/, "") + path;
}

export function buildUrl(
  baseUrl: string,
  path: string,
  query: QueryParams | undefined,
): string {
  const qs = serializeQuery(query);
  return joinUrl(baseUrl, path) + (qs ? `?${qs}` : "");
}
