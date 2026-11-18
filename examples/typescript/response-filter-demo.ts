import {
  createRegistry,
  defineEndpoint,
  HttpError,
  typed,
} from "../../src/index.js";
import type { ResponseFilter } from "../../src/index.js";

/**
 * response-filter-demo.ts
 *
 * Demonstrates `responseFilter`: reading response bodies into `HttpError.body`
 * so callers can inspect structured error payloads.
 *
 * Run: node --import tsx examples/typescript/response-filter-demo.ts
 */

const failingFetch = async (_req: Request): Promise<Response> => {
  return new Response(
    JSON.stringify({ error: "invalid_token", message: "token expired" }),
    { status: 401, headers: { "content-type": "application/json" } },
  );
};

const api = createRegistry(
  {
    profile: defineEndpoint({
      method: "GET",
      path: "/profile",
      responseSchema: typed<{ name: string }>(),
    }),
  },
  {
    baseUrl: "http://local.test",
    // Parse JSON error bodies and attach them to `HttpError.body`. `body` is
    // intentionally excluded from `error.toJSON()` so `message`/`status` stay
    // the primary public API.
    responseFilter: {
      errorBody: async (res) => {
        const text = await res.clone().text();
        if (!text) return undefined;
        try {
          return JSON.parse(text);
        } catch {
          return text;
        }
      },
    },
    fetch: failingFetch,
  },
);

async function main() {
  try {
    await api.profile();
  } catch (error) {
    if (error instanceof HttpError) {
      console.log("status:", error.status);          // 401
      console.log("message:", error.message);         // Unauthorized
      console.log("body:", error.body);               // { error: 'invalid_token', message: 'token expired' }
      console.log("toJSON:", error.toJSON());         // body excluded: { name, message, status, ... }
    }
  }

  // ResponseFilter is opt-in: without it, `HttpError.body` stays undefined.
  const plain = createRegistry(
    { profile: defineEndpoint({ method: "GET", path: "/profile" }) },
    { baseUrl: "http://local.test", fetch: failingFetch },
  );
  try {
    await plain.profile();
  } catch (error) {
    if (error instanceof HttpError) {
      console.log("without responseFilter, body is:", error.body); // undefined
    }
  }
}

main();
