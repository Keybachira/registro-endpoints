import type { FetchLike } from "../../src/index.js";

export interface Recorded {
  request: Request;
  body: string | null;
}

/** In-memory transport: no network needed (local-dev fallback). */
export function fakeFetch(
  respond: Response[] | ((req: Request) => Response | Promise<Response>),
): { fetch: FetchLike; calls: Recorded[] } {
  const calls: Recorded[] = [];
  const queue = Array.isArray(respond) ? [...respond] : null;
  const fetch: FetchLike = async (req) => {
    const clone = req.clone();
    calls.push({ request: req, body: req.body ? await clone.text() : null });
    const response = queue
      ? queue.shift()
      : await (respond as (req: Request) => Response | Promise<Response>)(req);
    if (!response) {
      throw new Error("fakeFetch: no more queued responses");
    }
    return response;
  };
  return { fetch, calls };
}

export const json = (data: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(data), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  });
