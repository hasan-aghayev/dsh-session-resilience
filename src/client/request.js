/**
 * Run one browser request with a deadline so a dropped local connection cannot leave the UI pending.
 * @param {RequestInfo | URL} input - Request URL or request object.
 * @param {RequestInit} init - Fetch options for the request.
 * @param {number} timeoutMs - Maximum time to wait for the response.
 * @param {typeof fetch} fetcher - Fetch implementation, injectable for tests.
 * @returns {Promise<Response>} The completed fetch response.
 */
export async function fetchWithTimeout(input, init, timeoutMs, fetcher = globalThis.fetch) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetcher(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Share an in-flight request and allow the next call to retry after it settles.
 * @template Value
 * @param {() => Promise<Value>} run - Operation to perform for the next request.
 * @returns {() => Promise<Value>} A function that shares concurrent calls.
 */
export function singleFlight(run) {
  /** @type {Promise<Value> | undefined} */
  let pending;
  return () => {
    if (pending !== undefined) return pending;
    const current = Promise.resolve().then(run);
    pending = current;
    const clear = () => {
      if (pending === current) pending = undefined;
    };
    void current.then(clear, clear);
    return current;
  };
}
