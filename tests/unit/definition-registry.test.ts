import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  composeRegistry,
  createRegistry,
  defineEndpoint,
  DefinitionError,
  isEndpoint,
  RegistryError,
  typed,
} from "../../src/index.js";

describe("defineEndpoint", () => {
  it("creates a frozen, inert definition", () => {
    let called = false;
    const e = defineEndpoint({
      method: "GET",
      path: "/users/:id",
      headers: () => ((called = true), {}),
    });
    assert.equal(called, false);
    assert.ok(Object.isFrozen(e));
    assert.ok(isEndpoint(e));
    assert.equal(e.method, "GET");
  });
  it("does not expose typing markers at runtime", () => {
    const e = defineEndpoint({
      method: "GET",
      path: "/x",
      responseSchema: typed<number>(),
    });
    assert.deepEqual(Object.keys(e).sort(), [
      "method",
      "path",
      "responseSchema",
    ]);
  });
  it("validates structure", () => {
    assert.throws(
      () => defineEndpoint({ method: "FETCH" as never, path: "/x" }),
      DefinitionError,
    );
    assert.throws(
      () => defineEndpoint({ method: "GET", path: "x" }),
      DefinitionError,
    );
    assert.throws(
      () => defineEndpoint({ method: "GET", path: "/x?a=1" }),
      DefinitionError,
    );
    assert.throws(
      () => defineEndpoint({ method: "GET", path: "/a/:id/:id" }),
      DefinitionError,
    );
    assert.throws(
      () => defineEndpoint({ method: "GET", path: "/a/:1x" }),
      DefinitionError,
    );
    assert.throws(
      () =>
        defineEndpoint({ method: "GET", path: "/a", body: typed<string>() }),
      DefinitionError,
    );
    assert.throws(
      () => defineEndpoint({ method: "POST", path: "/a", body: {} as never }),
      DefinitionError,
    );
  });
});

describe("createRegistry", () => {
  it("builds nested callables with the endpoint attached", () => {
    const get = defineEndpoint({ method: "GET", path: "/a" });
    const api = createRegistry({ a: { b: { get } } });
    assert.equal(typeof api.a.b.get, "function");
    assert.equal(api.a.b.get.endpoint, get);
    assert.ok(Object.isFrozen(api.a));
  });
  it("rejects invalid entries and circular trees", () => {
    assert.throws(() => createRegistry({ x: 1 } as never), RegistryError);
    assert.throws(() => createRegistry({ x: () => 1 } as never), RegistryError);
    const loop: Record<string, unknown> = {};
    loop["self"] = loop;
    assert.throws(() => createRegistry(loop as never), RegistryError);
  });
  it("instances are isolated", () => {
    const e = defineEndpoint({ method: "GET", path: "/a" });
    const one = createRegistry({ e }, { baseUrl: "http://one.test" });
    const two = createRegistry({ e }, { baseUrl: "http://two.test" });
    assert.notEqual(one.e, two.e);
  });
});

describe("composeRegistry", () => {
  const a = defineEndpoint({ method: "GET", path: "/a" });
  const b = defineEndpoint({ method: "GET", path: "/b" });
  const c = defineEndpoint({ method: "GET", path: "/c" });

  it("merges groups recursively", () => {
    const merged = composeRegistry([
      { users: { a } },
      { users: { b }, other: { c } },
    ]);
    assert.deepEqual(Object.keys(merged), ["users", "other"]);
    assert.deepEqual(Object.keys(merged.users), ["a", "b"]);
  });
  it("throws on collisions by default, with the path", () => {
    assert.throws(
      () => composeRegistry([{ users: { get: a } }, { users: { get: b } }]),
      (e: unknown) =>
        e instanceof RegistryError &&
        e.code === "REGISTRY_COLLISION" &&
        e.path === "users.get",
    );
  });
  it("same endpoint twice is a no-op", () => {
    assert.doesNotThrow(() => composeRegistry([{ x: a }, { x: a }]));
  });
  it("explicit policies: keep-first and replace", () => {
    assert.equal(
      composeRegistry([{ x: a }, { x: b }], { onConflict: "keep-first" }).x,
      a,
    );
    assert.equal(
      composeRegistry([{ x: a }, { x: b }], { onConflict: "replace" }).x,
      b,
    );
  });
  it("does not mutate inputs", () => {
    const one = { users: { a } };
    const two = { users: { b } };
    composeRegistry([one, two]);
    assert.deepEqual(Object.keys(one.users), ["a"]);
  });
});
