/** Extracts information from error responses to attach to thrown `HttpError`s. */
export interface ResponseFilter {
  /**
   * Reads the body of a non-ok response and returns a value to attach as
   * `HttpError.body`. Return `undefined` to attach nothing. Throwing here is
   * swallowed: the error is still thrown without a body.
   */
  errorBody?: (response: Response) => unknown | Promise<unknown>;
}

/** Applies the response filter to a non-ok response. Never throws. */
export async function applyResponseFilter(
  filter: ResponseFilter | undefined,
  response: Response,
): Promise<unknown> {
  if (!filter?.errorBody) return undefined;
  try {
    return await filter.errorBody(response);
  } catch {
    return undefined;
  }
}
