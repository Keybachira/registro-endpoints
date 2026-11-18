import {
  composeRegistry,
  createRegistry,
  defineEndpoint,
  HttpError,
  typed,
} from "../../src/index.js";

type User = { id: string; name: string };

const users = {
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
};
const health = { health: defineEndpoint({ method: "GET", path: "/health" }) };

export const api = createRegistry(composeRegistry([users, health]), {
  baseUrl: "http://localhost:3000",
  timeoutMs: 5_000,
  // In-memory transport so this file runs without a server (local-dev fallback):
  fetch: async (req) =>
    new URL(req.url).pathname === "/health"
      ? Response.json({ ok: true })
      : Response.json({ id: "1", name: "Aquiles" }),
});

const user = await api.users.get({ params: { id: "1" } }); // user: User
console.log(user.name);

try {
  await api.users.create({ body: { name: "Aquiles" } });
} catch (error) {
  if (error instanceof HttpError && error.status === 409)
    console.log("already exists");
  else throw error;
}
