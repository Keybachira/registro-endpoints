import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  AbortedError,
  ConfigurationError,
  createRegistry,
  defineEndpoint,
  HttpError,
  NetworkError,
  RequestValidationError,
  ResolutionError,
  ResponseParseError,
  ResponseValidationError,
  TimeoutError,
  typed,
} from "../../src/index.js";
import type { StandardSchemaLike } from "../../src/index.js";
import { fakeFetch, json } from "./helpers.js";

const BASE = "http://localhost:3000/api";

describe("requests", () => {
  it("builds URL, method and headers", async () => {
    const { fetch, calls } = fakeFetch(() => json({ id: "7" }));
    const api = createRegistry(
      {
        get: defineEndpoint({
          method: "GET",
          path: "/users/:id",
          headers: { "x-endpoint": "e" },
        }),
      },
      {
        baseUrl: BASE,
        fetch,
        headers: { "x-registry": "r", "x-endpoint": "overridden" },
      },
    );
    const out = await api.get({
      params: { id: 7 },
      query: { a: [1, 2], b: "x y" },
      headers: { "x-call": "c" },
    });
    assert.deepEqual(out, { id: "7" });
    const req = calls[0]!.request;
    assert.equal(req.url, "http://localhost:3000/api/users/7?a=1&a=2&b=x%20y");
    assert.equal(req.method, "GET");
    assert.equal(req.headers.get("x-registry"), "r");
    assert.equal(req.headers.get("x-endpoint"), "e");
    assert.equal(req.headers.get("x-call"), "c");
  });
  it("supports async header functions and removing headers with undefined", async () => {
    const { fetch, calls } = fakeFetch(() => json({}));
    const api = createRegistry(
      { p: defineEndpoint({ method: "POST", path: "/p" }) },
      {
        baseUrl: BASE,
        fetch,
        headers: async () => ({ authorization: "Bearer t", "x-a": "1" }),
      },
    );
    await api.p({ body: {}, headers: { "x-a": undefined } });
    assert.equal(calls[0]!.request.headers.get("authorization"), "Bearer t");
    assert.equal(calls[0]!.request.headers.has("x-a"), false);
  });
  it("endpoint baseUrl wins over registry baseUrl", async () => {
    const { fetch, calls } = fakeFetch(() => json({}));
    const api = createRegistry(
      {
        x: defineEndpoint({
          method: "GET",
          path: "/x",
          baseUrl: "http://other.test",
        }),
      },
      { baseUrl: BASE, fetch },
    );
    await api.x();
    assert.equal(calls[0]!.request.url, "http://other.test/x");
  });
  it("throws ConfigurationError without baseUrl (outside browsers)", async () => {
    const { fetch } = fakeFetch(() => json({}));
    const api = createRegistry(
      { x: defineEndpoint({ method: "GET", path: "/x" }) },
      { fetch },
    );
    await assert.rejects(
      api.x(),
      (e: unknown) =>
        e instanceof ConfigurationError && e.endpoint === "GET /x",
    );
  });
  it("adds endpoint label to resolution errors", async () => {
    const { fetch } = fakeFetch(() => json({}));
    const api = createRegistry(
      { x: defineEndpoint({ method: "GET", path: "/x/:id" }) },
      { baseUrl: BASE, fetch },
    );
    await assert.rejects(
      api.x({ params: {} as never }),
      (e: unknown) =>
        e instanceof ResolutionError && e.endpoint === "GET /x/:id",
    );
  });
});

describe("bodies", () => {
  const make = (fetch: ReturnType<typeof fakeFetch>["fetch"]) =>
    createRegistry(
      { p: defineEndpoint({ method: "POST", path: "/p" }) },
      { baseUrl: BASE, fetch },
    );

  it("serializes objects as JSON with content-type", async () => {
    const { fetch, calls } = fakeFetch(() => json({}));
    await make(fetch).p({ body: { name: "Aquiles" } });
    assert.equal(
      calls[0]!.request.headers.get("content-type"),
      "application/json",
    );
    assert.equal(calls[0]!.body, '{"name":"Aquiles"}');
  });
  it("respects a caller content-type", async () => {
    const { fetch, calls } = fakeFetch(() => json({}));
    await make(fetch).p({
      body: { a: 1 },
      headers: { "content-type": "application/vnd.api+json" },
    });
    assert.equal(
      calls[0]!.request.headers.get("content-type"),
      "application/vnd.api+json",
    );
  });
  it("never forces application/json on FormData (boundary preserved)", async () => {
    const { fetch, calls } = fakeFetch(() => json({}));
    const fd = new FormData();
    fd.set("file", "hello");
    await make(fetch).p({ body: fd });
    const ct = calls[0]!.request.headers.get("content-type") ?? "";
    assert.match(ct, /^multipart\/form-data; boundary=/);
  });
  it("URLSearchParams and strings pass through", async () => {
    const { fetch, calls } = fakeFetch(() => json({}));
    const api = make(fetch);
    await api.p({ body: new URLSearchParams({ a: "1" }) });
    assert.match(
      calls[0]!.request.headers.get("content-type") ?? "",
      /application\/x-www-form-urlencoded/,
    );
    assert.equal(calls[0]!.body, "a=1");
    await api.p({ body: "raw" });
    assert.equal(calls[1]!.body, "raw");
    assert.notEqual(
      calls[1]!.request.headers.get("content-type"),
      "application/json",
    );
  });
  it("rejects non-serializable bodies", async () => {
    const { fetch } = fakeFetch(() => json({}));
    const circular: Record<string, unknown> = {};
    circular["me"] = circular;
    await assert.rejects(make(fetch).p({ body: circular }), ResolutionError);
    await assert.rejects(make(fetch).p({ body: 1n }), ResolutionError);
  });
});

describe("responses", () => {
  const call = (
    res: () => Response,
    parseAs?: "json" | "text" | "response" | "blob",
  ) => {
    const { fetch } = fakeFetch(res);
    const api = createRegistry(
      { g: defineEndpoint({ method: "GET", path: "/g" }) },
      { baseUrl: BASE, fetch },
    );
    return api.g(parseAs ? { parseAs } : undefined);
  };
  it("parses JSON, text, empty and 204", async () => {
    assert.deepEqual(await call(() => json({ a: 1 })), { a: 1 });
    assert.equal(
      await call(
        () =>
          new Response("hello", { headers: { "content-type": "text/plain" } }),
      ),
      "hello",
    );
    assert.equal(
      await call(
        () =>
          new Response("", { headers: { "content-type": "application/json" } }),
      ),
      undefined,
    );
    assert.equal(
      await call(() => new Response(null, { status: 204 })),
      undefined,
    );
    assert.equal(await call(() => new Response("")), undefined);
  });
  it("vendor +json content types are JSON", async () => {
    const res = () =>
      new Response('{"a":1}', {
        headers: { "content-type": "application/problem+json; charset=utf-8" },
      });
    assert.deepEqual(await call(res), { a: 1 });
  });
  it("binary falls back to Blob; parseAs overrides", async () => {
    const blob = await call(
      () =>
        new Response("abc", {
          headers: { "content-type": "application/octet-stream" },
        }),
    );
    assert.equal(blob instanceof Blob, true);
    assert.equal(
      await call(
        () =>
          new Response("x", {
            headers: { "content-type": "application/json" },
          }),
        "text",
      ),
      "x",
    );
  });
  it("parseAs 'response' returns the raw Response", async () => {
    const r = await call(() => json({ a: 1 }), "response");
    assert.equal(r instanceof Response, true);
  });
  it("invalid JSON is a ResponseParseError without leaking the body", async () => {
    await assert.rejects(
      call(
        () =>
          new Response("{secret", {
            headers: { "content-type": "application/json" },
          }),
      ),
      (e: unknown) =>
        e instanceof ResponseParseError &&
        !JSON.stringify(e).includes("secret") &&
        !e.message.includes("secret"),
    );
  });
});

describe("errors", () => {
  it("HTTP errors carry status and a sanitized URL; nothing sensitive is serialized", async () => {
    const { fetch } = fakeFetch(() =>
      Object.defineProperty(
        new Response('{"token":"SECRET"}', {
          status: 401,
          statusText: "Unauthorized",
        }),
        "url",
        { value: "https://user:pw@api.test/x?token=SECRET#h" },
      ),
    );
    const api = createRegistry(
      { g: defineEndpoint({ method: "GET", path: "/x" }) },
      { baseUrl: BASE, fetch, headers: { authorization: "Bearer SECRET" } },
    );
    await assert.rejects(api.g(), (e: unknown) => {
      assert.ok(e instanceof HttpError);
      assert.equal(e.status, 401);
      assert.equal(e.code, "HTTP_ERROR");
      assert.equal(e.url, "https://api.test/x");
      const dump =
        JSON.stringify(e) + e.message + String(e.stack?.split("\n")[0]);
      assert.ok(!dump.includes("SECRET"));
      assert.ok(!dump.includes("pw"));
      assert.equal(e.response.status, 401);
      return true;
    });
  });
  it("network failures become NetworkError with cause", async () => {
    const api = createRegistry(
      { g: defineEndpoint({ method: "GET", path: "/x" }) },
      {
        baseUrl: BASE,
        fetch: async () => {
          throw new TypeError("fetch failed");
        },
      },
    );
    await assert.rejects(
      api.g(),
      (e: unknown) =>
        e instanceof NetworkError &&
        e.code === "NETWORK_ERROR" &&
        e.cause instanceof TypeError,
    );
  });
  it("every error has a stable code", async () => {
    const api = createRegistry(
      { g: defineEndpoint({ method: "GET", path: "/x" }) },
      { baseUrl: BASE, fetch: async () => new Response("no", { status: 500 }) },
    );
    await assert.rejects(
      api.g(),
      (e: unknown) => (e as { code?: string }).code === "HTTP_ERROR",
    );
  });
});

describe("cancellation and timeout", () => {
  const hang = (req: Request) =>
    new Promise<Response>((_, reject) =>
      req.signal.addEventListener("abort", () =>
        reject(new DOMException("x", "AbortError")),
      ),
    );
  const hangIgnoringSignal = () => new Promise<Response>(() => {});

  it("AbortSignal -> AbortedError", async () => {
    const api = createRegistry(
      { g: defineEndpoint({ method: "GET", path: "/x" }) },
      { baseUrl: BASE, fetch: hang },
    );
    const ac = new AbortController();
    const p = api.g({ signal: ac.signal });
    ac.abort();
    await assert.rejects(p, AbortedError);
  });
  it("already-aborted signal fails fast", async () => {
    const { fetch, calls } = fakeFetch(() => json({}));
    const api = createRegistry(
      { g: defineEndpoint({ method: "GET", path: "/x" }) },
      { baseUrl: BASE, fetch },
    );
    await assert.rejects(api.g({ signal: AbortSignal.abort() }), AbortedError);
    assert.equal(calls.length, 0);
  });
  it("timeout -> TimeoutError (also for adapters ignoring the signal)", async () => {
    const a = createRegistry(
      { g: defineEndpoint({ method: "GET", path: "/x" }) },
      { baseUrl: BASE, fetch: hang, timeoutMs: 20 },
    );
    await assert.rejects(
      a.g(),
      (e: unknown) => e instanceof TimeoutError && e.timeoutMs === 20,
    );
    const b = createRegistry(
      { g: defineEndpoint({ method: "GET", path: "/x" }) },
      { baseUrl: BASE, fetch: hangIgnoringSignal },
    );
    await assert.rejects(b.g({ timeoutMs: 20 }), TimeoutError);
  });
  it("rejects invalid timeoutMs", async () => {
    const { fetch } = fakeFetch(() => json({}));
    const api = createRegistry(
      { g: defineEndpoint({ method: "GET", path: "/x" }) },
      { baseUrl: BASE, fetch },
    );
    await assert.rejects(api.g({ timeoutMs: 0 }), ConfigurationError);
  });
  it("does not retry (single transport call on failure)", async () => {
    let n = 0;
    const api = createRegistry(
      { p: defineEndpoint({ method: "POST", path: "/x" }) },
      {
        baseUrl: BASE,
        fetch: async () => (n++, new Response("", { status: 503 })),
      },
    );
    await assert.rejects(api.p({ body: {} }), HttpError);
    assert.equal(n, 1);
  });
});

describe("validation", () => {
  const std = <T>(check: (v: unknown) => v is T): StandardSchemaLike<T> => ({
    "~standard": {
      validate: (v) =>
        check(v) ? { value: v } : { issues: [{ message: "bad" }] },
    },
  });
  const isNum = (v: unknown): v is number => typeof v === "number";

  it("validates input (parse + standard schema) before any request", async () => {
    const { fetch, calls } = fakeFetch(() => json({}));
    const api = createRegistry(
      {
        a: defineEndpoint({ method: "POST", path: "/a", body: std(isNum) }),
        b: defineEndpoint({
          method: "GET",
          path: "/b",
          query: {
            parse: (v: unknown) => {
              if (!v) throw new Error("query required");
              return v as { q: string };
            },
          },
        }),
      },
      { baseUrl: BASE, fetch },
    );
    await assert.rejects(
      api.a({ body: "x" as never }),
      (e: unknown) => e instanceof RequestValidationError && e.part === "body",
    );
    await assert.rejects(
      api.b({ query: undefined as never }),
      (e: unknown) => e instanceof RequestValidationError && e.part === "query",
    );
    assert.equal(calls.length, 0);
    await api.a({ body: 5 });
    assert.equal(calls.length, 1);
  });
  it("uses validated (transformed) values", async () => {
    const { fetch, calls } = fakeFetch(() => json({}));
    const api = createRegistry(
      {
        a: defineEndpoint({
          method: "POST",
          path: "/a",
          body: {
            parse: (v: unknown): Record<string, unknown> => ({
              ...(v as object),
              added: true,
            }),
          },
        }),
      },
      { baseUrl: BASE, fetch },
    );
    await api.a({ body: { x: 1 } });
    assert.equal(calls[0]!.body, '{"x":1,"added":true}');
  });
  it("validates responses and distinguishes the error kind", async () => {
    const { fetch } = fakeFetch(() => json({ id: "1" }));
    const api = createRegistry(
      {
        ok: defineEndpoint({
          method: "GET",
          path: "/ok",
          responseSchema: typed<{ id: string }>(),
        }),
        bad: defineEndpoint({
          method: "GET",
          path: "/bad",
          responseSchema: std(isNum),
        }),
      },
      { baseUrl: BASE, fetch },
    );
    assert.deepEqual(await api.ok(), { id: "1" });
    await assert.rejects(
      api.bad(),
      (e: unknown) =>
        e instanceof ResponseValidationError &&
        e.code === "RESPONSE_VALIDATION",
    );
  });
  it("validation issues are not serialized", async () => {
    const { fetch } = fakeFetch(() => json({}));
    const api = createRegistry(
      {
        a: defineEndpoint({
          method: "POST",
          path: "/a",
          body: {
            parse: (): Record<string, unknown> => {
              throw new Error("password=hunter2");
            },
          },
        }),
      },
      { baseUrl: BASE, fetch },
    );
    await assert.rejects(api.a({ body: {} }), (e: unknown) => {
      const err = e as RequestValidationError;
      return (
        !JSON.stringify(err).includes("hunter2") &&
        !err.message.includes("hunter2") &&
        err.issues !== undefined
      );
    });
  });
});

describe("middleware", () => {
  it("runs in onion order and can transform requests and observe responses", async () => {
    const order: string[] = [];
    const { fetch, calls } = fakeFetch(() => json({ ok: true }));
    const api = createRegistry(
      { g: defineEndpoint({ method: "GET", path: "/g" }) },
      {
        baseUrl: BASE,
        fetch,
        middleware: [
          async (ctx, next) => {
            order.push("a:before");
            const res = await next();
            order.push(`a:after:${res.status}`);
            return res;
          },
          async (ctx, next) => {
            order.push("b:before");
            const headers = new Headers(ctx.request.headers);
            headers.set("x-added", ctx.label);
            const res = await next(new Request(ctx.request, { headers }));
            order.push("b:after");
            return res;
          },
        ],
      },
    );
    await api.g();
    assert.deepEqual(order, ["a:before", "b:before", "b:after", "a:after:200"]);
    assert.equal(calls[0]!.request.headers.get("x-added"), "GET /g");
  });
  it("can short-circuit without calling transport", async () => {
    const { fetch, calls } = fakeFetch(() => json({}));
    const api = createRegistry(
      { g: defineEndpoint({ method: "GET", path: "/g" }) },
      { baseUrl: BASE, fetch, middleware: [() => json({ cached: true })] },
    );
    assert.deepEqual(await api.g(), { cached: true });
    assert.equal(calls.length, 0);
  });
  it("propagates middleware errors unchanged and guards double next()", async () => {
    const boom = new Error("boom");
    const { fetch } = fakeFetch(() => json({}));
    const a = createRegistry(
      { g: defineEndpoint({ method: "GET", path: "/g" }) },
      {
        baseUrl: BASE,
        fetch,
        middleware: [
          () => {
            throw boom;
          },
        ],
      },
    );
    await assert.rejects(a.g(), (e) => e === boom);
    const b = createRegistry(
      { g: defineEndpoint({ method: "GET", path: "/g" }) },
      {
        baseUrl: BASE,
        fetch,
        middleware: [
          async (_c, next) => {
            await next();
            return next();
          },
        ],
      },
    );
    await assert.rejects(b.g(), ConfigurationError);
  });
});
