import type { AnySchema } from "../validation/index.js";

export type HttpMethod =
  "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS";

export const HTTP_METHODS: readonly HttpMethod[] = [
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "HEAD",
  "OPTIONS",
];

/** Brand present at runtime so registries can tell endpoints from plain groups. */
export const ENDPOINT_BRAND = Symbol.for("endpoint-registry.endpoint");

export type HeaderValues = Record<string, string | undefined>;
export type HeadersSource =
  HeaderValues | (() => HeaderValues | Promise<HeaderValues>);

export type PathParamValue = string | number | boolean | bigint;
export type QueryScalar = string | number | boolean | bigint | Date;
export type QueryValue =
  QueryScalar | null | undefined | readonly (QueryScalar | null | undefined)[];
export type QueryParams = Readonly<Record<string, QueryValue>>;

export type ParseAs =
  "auto" | "json" | "text" | "blob" | "arrayBuffer" | "response";

// ---- path param inference (whole-segment params only: "/users/:id") ----
type Segments<P extends string> = P extends `${infer H}/${infer T}`
  ? H | Segments<T>
  : P;
type ParamName<S extends string> = S extends `:${infer N}` ? N : never;
export type PathParamNames<P extends string> = ParamName<Segments<P>>;

// ---- endpoint ----
export interface EndpointDefinition<
  M extends HttpMethod,
  P extends string,
  Q,
  B,
  R,
> {
  readonly method: M;
  readonly path: P;
  readonly baseUrl?: string;
  readonly headers?: HeadersSource;
  /** Schema for the query object. */
  readonly query?: AnySchema<Q>;
  /** Schema for the request body. */
  readonly body?: AnySchema<B>;
  /** Schema for the parsed response. */
  readonly responseSchema?: AnySchema<R>;
  /** Non-sensitive, free-form information. Never sent over the network. */
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface Endpoint<
  M extends HttpMethod,
  P extends string,
  Q,
  B,
  R,
> extends EndpointDefinition<M, P, Q, B, R> {
  readonly [ENDPOINT_BRAND]: true;
}

export type AnyEndpoint = Endpoint<
  HttpMethod,
  string,
  unknown,
  unknown,
  unknown
>;

// ---- call input ----
type ParamsInput<P extends string> = [PathParamNames<P>] extends [never]
  ? { params?: undefined }
  : { params: Record<PathParamNames<P>, PathParamValue> };

type QueryInput<Q> = unknown extends Q
  ? { query?: QueryParams }
  : [Q] extends [undefined]
    ? { query?: undefined }
    : undefined extends Q
      ? { query?: Q }
      : { query: Q };

type BodyInput<M extends HttpMethod, B> = M extends "GET" | "HEAD"
  ? { body?: undefined }
  : unknown extends B
    ? { body?: unknown }
    : [B] extends [undefined]
      ? { body?: undefined }
      : undefined extends B
        ? { body?: B }
        : { body: B };

export interface CallOptions {
  headers?: HeaderValues;
  signal?: AbortSignal;
  timeoutMs?: number;
  parseAs?: ParseAs;
}

export type CallInput<
  M extends HttpMethod,
  P extends string,
  Q,
  B,
> = ParamsInput<P> & QueryInput<Q> & BodyInput<M, B> & CallOptions;

export type EndpointCall<
  M extends HttpMethod,
  P extends string,
  Q,
  B,
  R,
> = ({} extends CallInput<M, P, Q, B>
  ? (input?: CallInput<M, P, Q, B>) => Promise<R>
  : (input: CallInput<M, P, Q, B>) => Promise<R>) & {
  readonly endpoint: Endpoint<M, P, Q, B, R>;
};

// ---- registry ----
export interface RegistryTree {
  readonly [key: string]: AnyEndpoint | RegistryTree;
}

export type Registry<T> = {
  readonly [K in keyof T]: T[K] extends Endpoint<
    infer M extends HttpMethod,
    infer P extends string,
    infer Q,
    infer B,
    infer R
  >
    ? EndpointCall<M, P, Q, B, R>
    : Registry<T[K]>;
};

export type UnionToIntersection<U> = (
  U extends unknown ? (k: U) => void : never
) extends (k: infer I) => void
  ? I
  : never;
