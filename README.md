# Endpoint Registry

> Define once. Register centrally. Consume anywhere.
> _Built in Angola. Designed for everyone._

Declarative, typed HTTP endpoints for JavaScript and TypeScript. Zero runtime dependencies, Fetch by default, no framework required.

Português: [README.pt-AO.md](./README.pt-AO.md) · Spec decisions: [docs/en/DECISIONS.md](./docs/en/DECISIONS.md)

Status: **0.1.0**, first implementation of the 0.1.0-draft spec. Not yet published; see the pending items in the decisions doc.

## Quick start

```ts
import { createRegistry, defineEndpoint, typed } from "endpoint-registry";

type User = { id: string; name: string };

const api = createRegistry(
  {
    users: {
      get: defineEndpoint({
        method: "GET",
        path: "/users/:id",
        responseSchema: typed<User>(),
      }),
      create: defineEndpoint({
        method: "POST",
        path: "/users",
        body: typed<{ name: string }>(),
        responseSchema: typed<User>(),
      }),
    },
  },
  { baseUrl: "https://api.example.ao", timeoutMs: 8000 },
);

const user = await api.users.get({ params: { id: "123" } }); // typed as User
await api.users.create({ body: { name: "Aquiles" } });
```

Plain JavaScript works the same way (no compile step). Path params, query, body and response types are inferred; wrong input is a compile error.

## Features

- **Definitions** are inert and frozen: `defineEndpoint({ method, path, baseUrl?, headers?, query?, body?, responseSchema?, metadata? })`.
- **Registries** are isolated (no global state) and can be nested. `composeRegistry([a, b])` merges trees and **throws on name collisions** unless you opt into `keep-first` / `replace`.
- **Resolution** is deterministic: percent-encoded path params, documented query rules, `..` blocked.
- **Transport**: global `fetch` by default, or any `(request: Request) => Promise<Response>`.
- **Middleware**: onion model, can replace the request, short-circuit, observe responses.
- **Validation** is optional: anything with `parse()` (Zod and similar) or the Standard Schema interface. `typed<T>()` gives types with no runtime cost.
- **Cancellation**: `signal` and `timeoutMs` per call or per registry.
- **Errors** have stable `code`s and never include tokens, headers, bodies or query strings.

## Options

```ts
createRegistry(tree, {
  baseUrl, // endpoint.baseUrl wins; browsers fall back to the page origin
  headers, // object or (async) function; merged registry < endpoint < call
  fetch, // custom transport (tests, local dev, adapters)
  middleware: [], // first = outermost
  timeoutMs, // no default timeout
  credentials,
  redirect, // passed to Request
});
```

Per call: `{ params, query, body, headers, signal, timeoutMs, parseAs }`. `parseAs: "response"` returns the raw `Response`.

## Errors

| Class                              | `code`                |
| ---------------------------------- | --------------------- |
| `DefinitionError`                  | `DEFINITION_ERROR`    |
| `RegistryError` (collision)        | `REGISTRY_COLLISION`  |
| `ResolutionError`                  | `RESOLUTION_ERROR`    |
| `RequestValidationError`           | `REQUEST_VALIDATION`  |
| `ResponseValidationError`          | `RESPONSE_VALIDATION` |
| `ResponseParseError`               | `RESPONSE_PARSE`      |
| `NetworkError`                     | `NETWORK_ERROR`       |
| `HttpError` (`status`, `response`) | `HTTP_ERROR`          |
| `TimeoutError`                     | `TIMEOUT`             |
| `AbortedError`                     | `ABORTED`             |
| `ConfigurationError`               | `CONFIGURATION_ERROR` |

Check with `error.code` or `instanceof`, never by parsing messages.

## Middleware

```ts
const timing: Middleware = async (ctx, next) => {
  const t = performance.now();
  const res = await next();
  console.log(ctx.label, res.status, Math.round(performance.now() - t), "ms");
  return res;
};
```

Requests reaching middleware include real headers (e.g. `Authorization`). Use `redactHeaders()` before logging.

## Security notes

- No automatic retries (so nothing non-idempotent is ever repeated).
- A dynamic `baseUrl` built from user input is an SSRF risk that the library cannot remove.
- Schema validation does not replace server-side validation.
- `HttpError.response` is returned unread; read or cancel its body to free the connection.

## Development

```bash
npm install
npm test          # typecheck + type tests + unit tests + runtime smoke
node examples/node/server-demo.mjs   # after `npm run build`
```

Tests use an in-memory `fetch`, so no network or server is needed. Requires ambient Web types (`lib: ["DOM"]` or `@types/node`) when consuming the `.d.ts`.

## Compatibility

Pure Web Standard APIs; no `window`, `document` or `process` (enforced by a test). Proposed minimums: Node ≥ 18.17, Deno 2.x, Bun ≥ 1.1, evergreen browsers. Node is verified locally; Deno and Bun run in CI (`.github/workflows/ci.yml`).

## License

MIT (pending confirmation by the project owner).
