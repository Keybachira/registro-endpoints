import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  joinUrl,
  resolvePath,
  ResolutionError,
  ConfigurationError,
  serializeQuery,
  buildUrl,
} from "../../src/index.js";

describe("resolvePath", () => {
  it("substitutes params and encodes segments", () => {
    assert.equal(resolvePath("/users/:id", { id: 42 }), "/users/42");
    assert.equal(
      resolvePath("/files/:name", { name: "a b/c?d#e" }),
      "/files/a%20b%2Fc%3Fd%23e",
    );
    assert.equal(
      resolvePath("/a/:x/b/:y", { x: true, y: 10n }),
      "/a/true/b/10",
    );
    assert.equal(resolvePath("/ping", undefined), "/ping");
  });
  it("throws on missing, empty and unexpected params", () => {
    assert.throws(() => resolvePath("/users/:id", {}), ResolutionError);
    assert.throws(() => resolvePath("/users/:id", undefined), ResolutionError);
    assert.throws(() => resolvePath("/users/:id", { id: "" }), ResolutionError);
    assert.throws(
      () => resolvePath("/users/:id", { id: NaN }),
      ResolutionError,
    );
    assert.throws(
      () => resolvePath("/users/:id", { id: 1, extra: 2 }),
      /Unexpected path parameter/,
    );
  });
  it("blocks dot segments (path traversal)", () => {
    assert.throws(
      () => resolvePath("/users/:id", { id: ".." }),
      ResolutionError,
    );
    assert.throws(
      () => resolvePath("/users/:id", { id: "." }),
      ResolutionError,
    );
    assert.equal(resolvePath("/users/:id", { id: "..%2F" }), "/users/..%252F");
  });
});

describe("serializeQuery", () => {
  it("is deterministic and documented", () => {
    assert.equal(serializeQuery(undefined), "");
    assert.equal(serializeQuery({}), "");
    assert.equal(
      serializeQuery({ a: "x y", b: 2, c: true }),
      "a=x%20y&b=2&c=true",
    );
    assert.equal(serializeQuery({ a: [1, 2, 3] }), "a=1&a=2&a=3");
    assert.equal(serializeQuery({ a: undefined, b: null }), "b=");
    assert.equal(serializeQuery({ a: [] }), "");
    assert.equal(serializeQuery({ "a&b": "c=d" }), "a%26b=c%3Dd");
    assert.equal(
      serializeQuery({ d: new Date("2026-11-18T10:00:00.000Z") }),
      "d=2026-11-18T10%3A00%3A00.000Z",
    );
  });
  it("rejects nested objects and non-finite numbers", () => {
    assert.throws(
      () => serializeQuery({ a: { b: 1 } as never }),
      ResolutionError,
    );
    assert.throws(() => serializeQuery({ a: Infinity }), ResolutionError);
  });
  it("preserves insertion order", () => {
    assert.equal(serializeQuery({ z: 1, a: 2 }), "z=1&a=2");
  });
});

describe("joinUrl / buildUrl", () => {
  it("joins without double slashes and keeps base path", () => {
    assert.equal(
      joinUrl("https://api.example.ao", "/users"),
      "https://api.example.ao/users",
    );
    assert.equal(
      joinUrl("https://api.example.ao/", "/users"),
      "https://api.example.ao/users",
    );
    assert.equal(
      joinUrl("https://api.example.ao/v1//", "/users"),
      "https://api.example.ao/v1/users",
    );
    assert.equal(
      buildUrl("http://localhost:3000", "/a", { q: "1" }),
      "http://localhost:3000/a?q=1",
    );
  });
  it("rejects unsafe base URLs", () => {
    assert.throws(() => joinUrl("not a url", "/x"), ConfigurationError);
    assert.throws(() => joinUrl("ftp://x.com", "/x"), ConfigurationError);
    assert.throws(() => joinUrl("https://x.com?a=1", "/x"), ConfigurationError);
    assert.throws(
      () => joinUrl("https://user:pw@x.com", "/x"),
      ConfigurationError,
    );
  });
});
