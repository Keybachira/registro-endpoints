import {
  createRegistry,
  defineEndpoint,
  HttpError,
  NetworkError,
  retryMiddleware,
  typed,
} from "../../src/index.js";

/**
 * retry-demo.ts
 *
 * Demonstrates the `retries` registry option and `retryMiddleware`.
 *
 * Run: node --import tsx examples/typescript/retry-demo.ts
 */

type Order = { id: string; total: number };

let flakyAttempts = 0;
const flakyFetch = async (req: Request): Promise<Response> => {
  flakyAttempts += 1;
  if (flakyAttempts < 3) {
    // Simulate an overloaded service: 503 on the first two attempts.
    return new Response(JSON.stringify({ error: "overloaded" }), {
      status: 503,
      headers: { "content-type": "application/json" },
    });
  }
  return Response.json({ id: "1", total: 42 } as Order);
};

const api = createRegistry(
  {
    orders: {
      get: defineEndpoint({
        method: "GET",
        path: "/orders/:id",
        responseSchema: typed<Order>(),
      }),
    },
  },
  {
    baseUrl: "http://local.test",
    // `retries` is the maximum number of attempts (0 disables). It maps
    // directly to `retryMiddleware({ maxAttempts })` and runs outermost.
    retries: 3,
    // User middleware re-runs on every attempt, so this logs each try.
    middleware: [
      async (ctx, next) => {
        const start = performance.now();
        const res = await next();
        console.log(
          `  [${ctx.label}] ${res.status} in ${Math.round(
            performance.now() - start,
          )}ms`,
        );
        return res;
      },
    ],
    fetch: flakyFetch,
  },
);

async function main() {
  // --- 1. retries recover from retryable errors ---
  flakyAttempts = 0;
  try {
    const order = await api.orders.get({ params: { id: "1" } });
    console.log("order:", order); // { id: "1", total: 42 }
  } catch (error) {
    console.error("unexpected failure:", error);
  }

  // --- 2. the last attempt always surfaces its error ---
  let dialAttempts = 0;
  const alwaysFailing = createRegistry(
    { ping: defineEndpoint({ method: "GET", path: "/ping" }) },
    {
      baseUrl: "http://local.test",
      retries: 2,
      fetch: async () => {
        dialAttempts += 1;
        throw new Error("dial timeout");
      },
    },
  );
  try {
    await alwaysFailing.ping();
  } catch (error) {
    if (!(error instanceof NetworkError)) throw error;
    console.log(
      `ping failed after ${dialAttempts} attempts:`,
      error.code,
    );
  }
  try {
    await alwaysFailing.ping();
  } catch (error) {
    console.log(
      `ping failed after ${dialAttempts} attempts:`,
      error instanceof NetworkError ? error.code : String(error),
    );
  }

  // --- 3. retryMiddleware directly for custom options ---
  const custom = createRegistry(
    { health: defineEndpoint({ method: "GET", path: "/health" }) },
    {
      baseUrl: "http://local.test",
      middleware: [
        retryMiddleware({
          maxAttempts: 5,
          delay: 50,
          backoff: "fixed",
          retryableStatuses: [503],
          shouldRetry: (error) =>
            error instanceof HttpError && error.status === 503,
          onRetry: (attempt, error) =>
            console.log(`retry #${attempt} after ${error.message}`),
        }),
      ],
      fetch: async () => new Response("", { status: 503 }),
    },
  );
  try {
    await custom.health();
  } catch (error) {
    if (error instanceof HttpError) {
      console.log("health gave up with status", error.status); // 503
    }
  }
}

main();
