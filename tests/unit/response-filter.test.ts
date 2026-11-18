import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createRegistry, defineEndpoint, HttpError } from "../../src/index.js";
import { fakeFetch } from "./helpers.js";

describe("responseFilter", () => {
  const endpoint = defineEndpoint({ method: "GET", path: "/issue" });

  it("attaches decoded JSON error body to HttpError", async () => {
    const { fetch } = fakeFetch([
      Response.json({ code: "bad_request", field: "name" }, { status: 400 }),
    ]);
    const filter = { errorBody: async (response: Response) => response.json() };
    const api = createRegistry(
      { issue: endpoint },
      { baseUrl: "http://local.test", responseFilter: filter, fetch },
    );
    let err: unknown;
    try {
      await api.issue();
    } catch (e) {
      err = e;
    }
    assert(err instanceof HttpError);
    assert.strictEqual(err.status, 400);
    assert.deepStrictEqual(err.body, { code: "bad_request", field: "name" });
  });

  it("without a filter, HttpError.body is undefined", async () => {
    const { fetch } = fakeFetch([new Response(null, { status: 400 })]);
    const api = createRegistry({ issue: endpoint }, { baseUrl: "http://local.test", fetch });
    let err: unknown;
    try {
      await api.issue();
    } catch (e) {
      err = e;
    }
    assert(err instanceof HttpError);
    assert.strictEqual(err.body, undefined);
  });

  it("a filter that throws is swallowed (error still thrown without body)", async () => {
    const { fetch } = fakeFetch([new Response(null, { status: 500 })]);
    const filter = { errorBody: async () => {
      throw new Error("boom");
    } };
    const api = createRegistry(
      { issue: endpoint },
      { baseUrl: "http://local.test", responseFilter: filter, fetch },
    );
    await assert.rejects(
      api.issue(),
      (err: unknown) => err instanceof HttpError && err.body === undefined && err.status === 500,
    );
  });

  it("filter can return a text body", async () => {
    const { fetch } = fakeFetch([new Response("rate limited", { status: 429 })]);
    const filter = { errorBody: async (response: Response) => response.text() };
    const api = createRegistry(
      { issue: endpoint },
      { baseUrl: "http://local.test", responseFilter: filter, fetch },
    );
    let err: unknown;
    try {
      await api.issue();
    } catch (e) {
      err = e;
    }
    assert(err instanceof HttpError);
    assert.strictEqual(err.status, 429);
    assert.strictEqual(err.body, "rate limited");
  });
});
