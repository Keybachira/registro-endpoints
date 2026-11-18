# Decisions: closing Appendix A

Status: proposed for 0.1.0, implemented and covered by tests. Anything marked **pending** needs confirmation from the project owner.

| # | Open item (Appendix A) | Decision | Where tested |
|---|---|---|---|
| D1 | Transport contract | **Fetch-based**: `(request: Request) => Promise<Response>`. A transport-neutral contract is deferred; the library does not claim support for non-Fetch transports. | executor |
| D2 | `baseUrl` and path joining | Endpoint `baseUrl` > registry `baseUrl` > page origin (browser only). Base must be `http(s)`, with no credentials, query or hash. Trailing slashes on the base are trimmed; the base's own path prefix is kept (`https://x.ao/v1` + `/users` → `https://x.ao/v1/users`). Host and scheme are never rewritten. | resolver |
| D3 | Query serialization | Keys in insertion order; `encodeURIComponent` on keys and values. `undefined` omitted; `null` → `key=`; arrays → repeated key; empty array omitted; `Date` → ISO 8601; nested objects → `ResolutionError`; non-finite numbers rejected. | resolver |
| D4 | Typing of `:param` | Whole-segment params only (`/users/:id`). Inferred as `Record<names, string \| number \| boolean \| bigint>`. Missing, empty, `.`/`..` and unexpected params throw `ResolutionError`. Values are percent-encoded. | types, resolver |
| D5 | Collision policy | Default **error** (`REGISTRY_COLLISION`, with dotted path). Explicit `onConflict: "keep-first" \| "replace"`. Groups with the same name merge. The same endpoint object twice is a no-op. Inputs are never mutated. | composition |
| D6 | Response parsing | 204/205/304/HEAD and empty bodies → `undefined`. `*/json` and `+json` → JSON (invalid → `ResponseParseError`, body never included). `text/*`, XML, form-encoded or no content-type → text. Anything else → `Blob`. Per-call `parseAs` overrides (`response` returns the raw `Response`). | executor |
| D7 | Timeout and cancellation | Included in 0.1. `timeoutMs` (registry or call) → `TimeoutError`; `AbortSignal` → `AbortedError`. Adapters that ignore the signal are still cut off. **No default timeout.** | executor |
| D8 | Middleware | Onion model; first in the array is outermost. `next(request?)` may replace the request. Returning a `Response` without calling `next` short-circuits. Errors propagate unchanged. Calling `next` twice is a `ConfigurationError`. `redactHeaders()` helper for logging. | executor |
| D9 | Credentials, redirects, headers | `credentials` and `redirect` are registry options, passed to `Request` as given. Header precedence: registry < endpoint < call; `undefined` removes a header. Header sources may be functions (sync or async) for tokens. No credential is ever stored or logged. | executor |
| D10 | Minimum runtimes | **Pending.** Proposal: Node ≥ 18.17, Deno 2.x, Bun ≥ 1.1, evergreen browsers. CI matrix in `.github/workflows/ci.yml`; only Node is verified locally so far. | runtime |
| D11 | Package name / targets | `endpoint-registry` was **not found on the npm registry** on 2026-11-18 (HTTP 404). Re-check right before publishing. Publish target (npm, JSR or both): **pending**. | n/a |
| D12 | License | MIT file included. **Pending** your confirmation. | n/a |

## Deviations from the draft (allowed by the spec's "names may be adjusted")

- `requestSchema` was ambiguous (whole input or body?). 0.1.0 uses `query` and `body` (schemas) plus `responseSchema`. Header and param validation are not schema-driven.
- Types are inferred from schemas. For type-only inference without a validator use `typed<T>()` (zero runtime validation). No marker properties are added to runtime objects.
- Schemas: anything with `parse()` (Zod and similar) or the Standard Schema `~standard` interface (Zod 3.24+, Valibot, ArkType).
- `composeRegistry` takes an array of trees and returns a tree; pass it to `createRegistry`.

## Notes on the draft specification

1. §12.3 forbids automatic retries for non-idempotent calls, but no retry feature exists. 0.1.0 has **no retries at all**; add them later as middleware.
2. §3.4 bans `window`/`document`/`process`. A test now enforces it, and also bans `any` in `src` and runtime dependencies.
3. Path traversal: `encodeURIComponent` does not encode `.`, so `:id = ".."` would be normalized by URL parsing. Rejected explicitly (consider adding this to §7/§12).
4. §12.7 SSRF: `baseUrl` is validated, but a dynamic `baseUrl` from user input is still the consumer's risk. Not mitigated by the library.
5. Error bodies: `HttpError.response` is returned unread so callers can inspect it. If you never read or cancel it, some runtimes keep the connection until GC.
6. Not covered yet: streaming request bodies (`duplex`), retries, caching, OpenAPI generation (out of scope per §1.3).
