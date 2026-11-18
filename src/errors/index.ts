export type ErrorCode =
  | "DEFINITION_ERROR"
  | "REGISTRY_COLLISION"
  | "RESOLUTION_ERROR"
  | "REQUEST_VALIDATION"
  | "RESPONSE_VALIDATION"
  | "RESPONSE_PARSE"
  | "NETWORK_ERROR"
  | "HTTP_ERROR"
  | "TIMEOUT"
  | "ABORTED"
  | "CONFIGURATION_ERROR";

export interface ErrorContext {
  cause?: unknown;
  /** Label such as "GET /users/:id". Never contains query strings or credentials. */
  endpoint?: string;
}

/**
 * Base error. `code` is stable and meant for programmatic checks.
 * `toJSON()` is safe to log: it never contains headers, bodies, tokens or query strings.
 */
export class EndpointRegistryError extends Error {
  readonly code: ErrorCode;
  readonly endpoint: string | undefined;

  constructor(code: ErrorCode, message: string, context: ErrorContext = {}) {
    super(
      message,
      context.cause === undefined ? undefined : { cause: context.cause },
    );
    this.name = "EndpointRegistryError";
    this.code = code;
    this.endpoint = context.endpoint;
  }

  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      endpoint: this.endpoint,
    };
  }
}

export class DefinitionError extends EndpointRegistryError {
  constructor(message: string, context?: ErrorContext) {
    super("DEFINITION_ERROR", message, context);
    this.name = "DefinitionError";
  }
}

export class RegistryError extends EndpointRegistryError {
  /** Dotted path of the colliding name, e.g. "users.get". */
  readonly path: string | undefined;
  constructor(
    message: string,
    context: ErrorContext & { path?: string; collision?: boolean } = {},
  ) {
    super(
      context.collision ? "REGISTRY_COLLISION" : "DEFINITION_ERROR",
      message,
      context,
    );
    this.name = "RegistryError";
    this.path = context.path;
  }
}

export class ResolutionError extends EndpointRegistryError {
  constructor(message: string, context?: ErrorContext) {
    super("RESOLUTION_ERROR", message, context);
    this.name = "ResolutionError";
  }
}

abstract class ValidationErrorBase extends EndpointRegistryError {
  /** Raw issues from the validator. May contain user data: excluded from message and toJSON(). */
  readonly issues!: unknown;
  constructor(
    code: ErrorCode,
    message: string,
    issues: unknown,
    context?: ErrorContext,
  ) {
    super(code, message, context);
    Object.defineProperty(this, "issues", { value: issues, enumerable: false });
  }
}

export class RequestValidationError extends ValidationErrorBase {
  readonly part: "query" | "body";
  constructor(part: "query" | "body", issues: unknown, context?: ErrorContext) {
    super(
      "REQUEST_VALIDATION",
      `Request ${part} failed validation`,
      issues,
      context,
    );
    this.name = "RequestValidationError";
    this.part = part;
  }
}

export class ResponseValidationError extends ValidationErrorBase {
  constructor(issues: unknown, context?: ErrorContext) {
    super("RESPONSE_VALIDATION", "Response failed validation", issues, context);
    this.name = "ResponseValidationError";
  }
}

export class ResponseParseError extends EndpointRegistryError {
  constructor(message: string, context?: ErrorContext) {
    super("RESPONSE_PARSE", message, context);
    this.name = "ResponseParseError";
  }
}

export class NetworkError extends EndpointRegistryError {
  constructor(context?: ErrorContext) {
    super("NETWORK_ERROR", "Network request failed", context);
    this.name = "NetworkError";
  }
}

export class HttpError extends EndpointRegistryError {
  readonly status: number;
  readonly statusText: string;
  /** Origin + pathname only: no credentials, query string or hash. */
  readonly url: string;
  /** The raw Response (body unread). Not serialized, not part of the message. */
  readonly response!: Response;

  constructor(response: Response, context?: ErrorContext) {
    super(
      "HTTP_ERROR",
      `HTTP ${response.status}${response.statusText ? " " + response.statusText : ""}`,
      context,
    );
    this.name = "HttpError";
    this.status = response.status;
    this.statusText = response.statusText;
    this.url = sanitizeUrl(response.url);
    Object.defineProperty(this, "response", {
      value: response,
      enumerable: false,
    });
  }

  override toJSON(): Record<string, unknown> {
    return {
      ...super.toJSON(),
      status: this.status,
      statusText: this.statusText,
      url: this.url,
    };
  }
}

export class TimeoutError extends EndpointRegistryError {
  readonly timeoutMs: number;
  constructor(timeoutMs: number, context?: ErrorContext) {
    super("TIMEOUT", `Request timed out after ${timeoutMs}ms`, context);
    this.name = "TimeoutError";
    this.timeoutMs = timeoutMs;
  }
}

export class AbortedError extends EndpointRegistryError {
  constructor(context?: ErrorContext) {
    super("ABORTED", "Request was aborted", context);
    this.name = "AbortedError";
  }
}

export class ConfigurationError extends EndpointRegistryError {
  constructor(message: string, context?: ErrorContext) {
    super("CONFIGURATION_ERROR", message, context);
    this.name = "ConfigurationError";
  }
}

/** Strips credentials, query string and hash from a URL. Returns "" if unparsable. */
export function sanitizeUrl(url: string): string {
  try {
    const u = new URL(url);
    return u.origin + u.pathname;
  } catch {
    return "";
  }
}
