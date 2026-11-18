import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createRegistry, defineEndpoint } from "../../src/index.js";
import { ConfigurationError, HttpError } from "../../src/errors/index.js";
import { fakeFetch } from "./helpers.js";

describe("registry retries option", () => {
  const endpoint = defineEndpoint({ method: "GET", path: "/ping" });

  it("retries retryable statuses using the registry option", async () => {
    const { fetch, calls } = fakeFetch([
      new Response(null, { status: 503 }),
      Response.json({ ok: true }),
    ]);
    const api = createRegistry(
      { ping: endpoint },
      { baseUrl: "http://local.test", retries: 2, fetch },
    );
    const response = (await api.ping({ parseAs: "response" })) as Response;
    assert.strictEqual(response.status, 200);
    assert.deepStrictEqual(await response.json(), { ok: true });
    assert.strictEqual(calls.length, 2);
  });

  it("throws HttpError with the last status after exhausting retries", async () => {
    const { fetch, calls } = fakeFetch([
      new Response(null, { status: 503 }),
      new Response(null, { status: 503 }),
    ]);
    const api = createRegistry(
      { ping: endpoint },
      { baseUrl: "http://local.test", retries: 2, fetch },
    );
    await assert.rejects(
      api.ping(),
      (err: unknown) => err instanceof HttpError && err.status === 503,
    );
    assert.strictEqual(calls.length, 2);
  });

  it("retries: 0 disables retries", async () => {
    const { fetch, calls } = fakeFetch([new Response(null, { status: 503 })]);
    const api = createRegistry(
      { ping: endpoint },
      { baseUrl: "http://local.test", retries: 0, fetch },
    );
    await assert.rejects(api.ping());
    assert.strictEqual(calls.length, 1);
  });

  it("invalid retries throw ConfigurationError", () => {
    assert.throws(
      () => createRegistry({ ping: endpoint }, { retries: -1 }),
      ConfigurationError,
    );
    assert.throws(
      () => createRegistry({ ping: endpoint }, { retries: 1.5 }),
      ConfigurationError,
    );
  });

  it("retry middleware is outermost: user middleware runs once per attempt", async () => {
    const { fetch, calls } = fakeFetch([
      new Response(null, { status: 503 }),
      Response.json({ ok: true }),
    ]);
    let userRuns = 0;
    const userMiddleware = (_ctx: unknown, next: () => Promise<Response>) => {
      userRuns++;
      return next();
    };
    const api = createRegistry(
      { ping: endpoint },
      {
        baseUrl: "http://local.test",
        retries: 2,
        middleware: [userMiddleware],
        fetch,
      },
    );
    const response = (await api.ping({ parseAs: "response" })) as Response;
    assert.strictEqual(response.status, 200);
    assert.strictEqual(calls.length, 2);
    assert.strictEqual(userRuns, 2);
  });
});
