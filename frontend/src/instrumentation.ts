// Node-side instrumentation. Runs ONCE at server boot.
//
// Why this file exists: Next.js `rewrites()` proxies /api/* to the
// Flask backend using Node's built-in fetch (undici). undici aggressively
// pools HTTP keep-alive sockets. If gunicorn closes a pooled socket
// first — worker recycle, idle keepalive timeout, container restart —
// undici cheerfully reuses the dead socket and the request fails with
// `Error: socket hang up` / ECONNRESET. The user sees "freeze" / random
// failed requests in bursts because the whole pool dies at once.
//
// Fix: wrap the default Agent in a RetryAgent so transient socket
// errors (ECONNRESET, UND_ERR_SOCKET, etc.) on idempotent requests are
// retried once on a fresh connection — invisible to the caller.
// Also keep the client-side keepalive UNDER gunicorn's (75s) so we
// always close the socket before the server does.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  // `undici` ships inside Node.js (and is bundled by Next.js) but isn't
  // declared in package.json — types aren't visible to tsc, so suppress
  // the resolution error. The import works at runtime.
  // @ts-expect-error - undici has no published types in our deps
  const { setGlobalDispatcher, Agent, RetryAgent } = await import("undici");

  const base = new Agent({
    keepAliveTimeout: 30_000,
    keepAliveMaxTimeout: 60_000,
    pipelining: 1,
    connect: { timeout: 10_000 },
    // Long SSE streams must not be killed by the agent's body timeout.
    bodyTimeout: 0,
    headersTimeout: 30_000,
  });

  setGlobalDispatcher(
    new RetryAgent(base, {
      maxRetries: 2,
      minTimeout: 100,
      maxTimeout: 1_000,
      timeoutFactor: 2,
      retryAfter: false,
      methods: ["GET", "HEAD", "OPTIONS", "PUT", "DELETE"],
      statusCodes: [],
      errorCodes: [
        "ECONNRESET",
        "ECONNREFUSED",
        "ENOTFOUND",
        "ENETDOWN",
        "ENETUNREACH",
        "EHOSTDOWN",
        "UND_ERR_SOCKET",
        "UND_ERR_CONNECT_TIMEOUT",
      ],
    }),
  );

  // -------------------------------------------------------------------
  // Silence the expected SSE close-as-error log.
  //
  // Our SSE endpoint (/api/v1/events/stream) intentionally caps each
  // connection at ~25s (STREAM_MAX_SECONDS) and closes with
  // `Connection: close` so gthread workers and pooled proxy sockets
  // never get pinned. The browser's EventSource auto-reconnects on the
  // close — invisible to the user.
  //
  // undici / Next.js see that mid-body close as a "socket hang up" /
  // ECONNRESET and log it as a proxy error every ~30 seconds. That's
  // not a real error; the next request immediately succeeds. Filter
  // those specific lines out of console.error so the production log
  // stays meaningful.
  const origError = console.error.bind(console);
  console.error = (...args: unknown[]) => {
    const text = args
      .map((a) => {
        if (typeof a === "string") return a;
        if (a instanceof Error) return `${a.name}: ${a.message}`;
        try { return JSON.stringify(a); } catch { return String(a); }
      })
      .join(" ");
    if (
      text.includes("/api/v1/events/stream") &&
      (text.includes("socket hang up") ||
        text.includes("ECONNRESET") ||
        text.includes("UND_ERR_SOCKET"))
    ) {
      return; // expected end-of-stream, not an error
    }
    origError(...args);
  };
}
