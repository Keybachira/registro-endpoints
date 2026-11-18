// Plain JavaScript: no TypeScript, no compile step.
import { createRegistry, defineEndpoint } from "../../dist/index.js";

const api = createRegistry(
  { ping: defineEndpoint({ method: "GET", path: "/ping" }) },
  {
    baseUrl: "http://local.test",
    fetch: async () => Response.json({ pong: true }),
  },
);

console.log(await api.ping());
