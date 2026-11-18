import type { FetchLike } from "../../src/index.js";

export interface Recorded {
  request: Request;
  body: string | null;
}

/** In-memory transport: no network needed (local-dev fallback). */
export function fakeFetch(
  respond: (req: Request) => Response | Promise<Response>,
): { fetch: FetchLike; calls: Recorded[] } {
  const calls: Recorded[] = [];
  const fetch: FetchLike = async (req) => {
    const clone = req.clone();
    calls.push({ request: req, body: req.body ? await clone.text() : null });
    return respond(req);
  };
  return { fetch, calls };
}

export const json = (data: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(data), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  });
