import {
  composeRegistry,
  createRegistry,
  defineEndpoint,
  typed,
} from "../../src/index.js";
import type { PathParamNames } from "../../src/index.js";

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
    ? true
    : false;
function expectType<_T extends true>(): void {}

// ---- path param inference ----
expectType<Equal<PathParamNames<"/users/:id">, "id">>();
expectType<
  Equal<PathParamNames<"/users/:id/posts/:postId">, "id" | "postId">
>();
expectType<Equal<PathParamNames<"/users">, never>>();

type User = { id: string; name: string };
type NewUser = { name: string; email: string };

const getUser = defineEndpoint({
  method: "GET",
  path: "/users/:id",
  responseSchema: typed<User>(),
});
const listUsers = defineEndpoint({
  method: "GET",
  path: "/users",
  query: typed<{ page?: number; tags?: string[] } | undefined>(),
  responseSchema: typed<User[]>(),
});
const createUser = defineEndpoint({
  method: "POST",
  path: "/users",
  body: typed<NewUser>(),
  responseSchema: typed<User>(),
});
const ping = defineEndpoint({ method: "GET", path: "/ping" });

const api = createRegistry({
  users: { get: getUser, list: listUsers, create: createUser },
  ping,
});

// ---- valid usage + response inference ----
async function valid() {
  const user = await api.users.get({ params: { id: "1" } });
  expectType<Equal<typeof user, User>>();
  await api.users.get({ params: { id: 1 } }); // numbers allowed

  const users = await api.users.list({ query: { page: 2, tags: ["a"] } });
  expectType<Equal<typeof users, User[]>>();
  await api.users.list(); // query optional (schema allows undefined)

  const created = await api.users.create({
    body: { name: "A", email: "a@b.ao" },
  });
  expectType<Equal<typeof created, User>>();

  const pong = await api.ping(); // no input needed
  expectType<Equal<typeof pong, unknown>>();
  await api.ping({
    signal: new AbortController().signal,
    timeoutMs: 100,
    headers: { "x-id": "1" },
  });
}
void valid;

// ---- invalid usage ----
async function invalid() {
  // @ts-expect-error params are required for ":id" paths
  await api.users.get();
  // @ts-expect-error missing "id"
  await api.users.get({ params: {} });
  // @ts-expect-error wrong param name
  await api.users.get({ params: { userId: "1" } });
  // @ts-expect-error body is required
  await api.users.create({});
  // @ts-expect-error wrong body shape
  await api.users.create({ body: { name: "A" } });
  // @ts-expect-error wrong query type
  await api.users.list({ query: { page: "two" } });
  // @ts-expect-error GET has no body
  await api.ping({ body: { a: 1 } });
  // @ts-expect-error unknown endpoint
  await api.users.remove({ params: { id: "1" } });
}
void invalid;

// ---- invalid definitions ----
// @ts-expect-error invalid method
defineEndpoint({ method: "FETCH", path: "/x" });

// ---- composition keeps inference ----
const posts = {
  posts: {
    list: defineEndpoint({
      method: "GET",
      path: "/posts",
      responseSchema: typed<{ title: string }[]>(),
    }),
  },
};
const composed = createRegistry(
  composeRegistry([{ users: { get: getUser } }, posts] as const),
);
async function composedUse() {
  const u = await composed.users.get({ params: { id: "1" } });
  expectType<Equal<typeof u, User>>();
  const p = await composed.posts.list();
  expectType<Equal<typeof p, { title: string }[]>>();
}
void composedUse;
