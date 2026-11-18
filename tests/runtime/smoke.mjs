// Runs against the built package (dist). Works in Node, Deno (`deno run tests/runtime/smoke.mjs`) and Bun.
import { createRegistry, defineEndpoint, HttpError } from "../../dist/index.js";

const api = createRegistry(
  {
    users: {
      get: defineEndpoint({ method: "GET", path: "/users/:id" }),
      create: defineEndpoint({ method: "POST", path: "/users" }),
      missing: defineEndpoint({ method: "GET", path: "/missing" }),
    },
  },
  {
    baseUrl: "http://local.test",
    // In-memory transport: no network, no server needed.
    fetch: async (req) => {
      const url = new URL(req.url);
      if (url.pathname === "/users/1")
        return Response.json({ id: "1", q: url.search });
      if (url.pathname === "/users" && req.method === "POST")
        return Response.json(
          { ...(await req.json()), id: "2" },
          { status: 201 },
        );
      return new Response("nope", { status: 404 });
    },
  },
);

const eq = (a, b, msg) => {
  if (JSON.stringify(a) !== JSON.stringify(b))
    throw new Error(`${msg}: ${JSON.stringify(a)} !== ${JSON.stringify(b)}`);
};

eq(
  await api.users.get({ params: { id: 1 }, query: { a: [1, 2] } }),
  { id: "1", q: "?a=1&a=2" },
  "GET",
);
eq(
  await api.users.create({ body: { name: "Aquiles" } }),
  { name: "Aquiles", id: "2" },
  "POST",
);
try {
  await api.users.missing();
  throw new Error("expected HttpError");
} catch (e) {
  if (!(e instanceof HttpError) || e.status !== 404) throw e;
}
console.log("runtime smoke OK");
