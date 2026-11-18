# Changelog

## 0.1.1 — unreleased

### Resilience
- **`retries` registry option** (opt-in): `retries: N` maps to `retryMiddleware({ maxAttempts: N })` and runs outermost. `retries: 0` disables retries; invalid values throw `ConfigurationError`.
- **`retryMiddleware`** (standalone export): `maxAttempts`, `delay`, `backoff` (`"fixed"` | `"exponential"`), `retryableStatuses`, `shouldRetry(error, response?)`, `onRetry(attempt, error, response?)`. Retries retryable statuses and network errors; user middleware re-runs on every attempt; the last attempt surfaces its error/response so `HttpError.status` stays accurate.
- **`responseFilter`**: `responseFilter: { errorBody(response) }` decodes error bodies into `HttpError.body` (`body` is excluded from `toJSON()`). A throwing filter is swallowed; without a filter `body` is `undefined`.

### Examples
- `examples/typescript/retry-demo.ts` — `retries` option and standalone `retryMiddleware`.
- `examples/typescript/response-filter-demo.ts` — `responseFilter: { errorBody }` for structured `HttpError.body`.

## 0.1.0 — 2026-11-18
- First implementation of the 0.1.0-draft specification (Phase 0–3 core): definitions, registries, composition, path/query resolution, Fetch transport, middleware, optional validation, typed errors.
