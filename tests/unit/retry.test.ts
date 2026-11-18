import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { retryMiddleware } from "../../src/middleware/retry.js";
import { fakeFetch } from "./helpers.js";

describe("retryMiddleware", () => {
  it("retries retryable statuses until success", async () => {
    const { fetch, calls } = fakeFetch([
      new Response(null, { status: 503 }),
      new Response(null, { status: 503 }),
      Response.json({ ok: true }),
    ]);
    const mw = retryMiddleware({ maxAttempts: 3, delay: 0 });
    const res = await mw({} as never, () => fetch(new Request("http://local.test/")));
    assert.strictEqual(res.status, 200);
    assert.deepStrictEqual(await res.json(), { ok: true });
    assert.strictEqual(calls.length, 3);
  });

  it("surfaces the last non-ok response instead of throwing", async () => {
    const { fetch, calls } = fakeFetch([
      new Response(null, { status: 503 }),
      new Response(null, { status: 503 }),
    ]);
    const mw = retryMiddleware({ maxAttempts: 2, delay: 0 });
    const res = await mw({} as never, () => fetch(new Request("http://local.test/")));
    assert.strictEqual(res.status, 503);
    assert.strictEqual(calls.length, 2);
  });

  it("does not retry non-retryable statuses", async () => {
    const { fetch, calls } = fakeFetch([new Response(null, { status: 400 })]);
    const mw = retryMiddleware({ delay: 0 });
    let threw: Error | undefined;
    try {
      await mw({} as never, () => fetch(new Request("http://local.test/")));
    } catch (error) {
      threw = error as Error;
    }
    assert(threw);
    assert.strictEqual(calls.length, 1);
  });

  it("retries network errors", async () => {
    let calls = 0;
    const fetch = async () => {
      calls++;
      if (calls === 1) throw new TypeError("failed to fetch");
      return Response.json({ ok: true });
    };
    const mw = retryMiddleware({ maxAttempts: 3, delay: 0 });
    const res = await mw({} as never, () => fetch());
    assert.strictEqual(res.status, 200);
    assert.strictEqual(calls, 2);
  });

  it("exhausts retries on network errors and throws", async () => {
    const fetch = async () => {
      throw new TypeError("failed to fetch");
    };
    const mw = retryMiddleware({ maxAttempts: 2, delay: 0 });
    let caught: unknown;
    try {
      await mw({} as never, () => fetch());
    } catch (err) {
      caught = err;
    }
    assert.ok(caught instanceof Error);
    assert.strictEqual((caught as Error).message, "failed to fetch");
  });

  it("respects maxAttempts = 1 (no retries)", async () => {
    const { fetch, calls } = fakeFetch([new Response(null, { status: 503 })]);
    const mw = retryMiddleware({ maxAttempts: 1, delay: 0 });
    const res = await mw({} as never, () => fetch(new Request("http://local.test/")));
    assert.strictEqual(res.status, 503);
    assert.strictEqual(calls.length, 1);
  });

  it("shouldRetry can stop early", async () => {
    const { fetch, calls } = fakeFetch([
      new Response(null, { status: 503 }),
      new Response(null, { status: 503 }),
    ]);
    const mw = retryMiddleware({
      maxAttempts: 3,
      delay: 0,
      shouldRetry: (_error, attempt) => attempt < 1,
    });
    const res = await mw({} as never, () => fetch(new Request("http://local.test/")));
    assert.strictEqual(res.status, 503);
    assert.strictEqual(calls.length, 1);
  });

  it("onRetry is called with attempt, error and last response", async () => {
    const { fetch, calls } = fakeFetch([
      new Response(null, { status: 503 }),
      Response.json({ ok: true }),
    ]);
    const attempts: number[] = [];
    const mw = retryMiddleware({
      maxAttempts: 3,
      delay: 0,
      onRetry: (attempt) => attempts.push(attempt),
    });
    await mw({} as never, () => fetch(new Request("http://local.test/")));
    assert.deepStrictEqual(attempts, [1]);
    assert.strictEqual(calls.length, 2);
  });

  it("backoff function receives attempt and response", async () => {
    const { fetch, calls } = fakeFetch([
      new Response(null, { status: 503 }),
      new Response(null, { status: 503 }),
      Response.json({ ok: true }),
    ]);
    const delays: [number, number | undefined][] = [];
    const mw = retryMiddleware({
      maxAttempts: 3,
      delay: 0,
      backoff: (attempt, response) => {
        delays.push([attempt, response?.status]);
        return 0;
      },
    });
    await mw({} as never, () => fetch(new Request("http://local.test/")));
    assert.deepStrictEqual(delays, [
      [1, 503],
      [2, 503],
    ]);
    assert.strictEqual(calls.length, 3);
  });

  it("custom retryableStatuses", async () => {
    const { fetch, calls } = fakeFetch([
      new Response(null, { status: 418 }),
      Response.json({ ok: true }),
    ]);
    const mw = retryMiddleware({
      maxAttempts: 2,
      delay: 0,
      retryableStatuses: [418],
    });
    const res = await mw({} as never, () => fetch(new Request("http://local.test/")));
    assert.strictEqual(res.status, 200);
    assert.strictEqual(calls.length, 2);
  });
});


