import "server-only";

type Send = (event: string, data: unknown) => void;

/**
 * How long one stream stays open. Serverless hosts (Vercel) stop a function
 * after its max duration and log a timeout error, so there the stream is ended
 * cleanly a little earlier and the browser reconnects (EventSource does that by
 * itself). SSE_MAX_SECONDS overrides; 0 = no limit (long-running `npm start`).
 */
function maxStreamMs() {
  const env = Number(process.env.SSE_MAX_SECONDS);
  if (Number.isFinite(env) && env >= 0 && process.env.SSE_MAX_SECONDS) return env * 1000;
  return process.env.VERCEL ? 50_000 : 0;
}

/**
 * Server-Sent Events response. `subscribe` receives a `send` function and
 * returns an unsubscribe callback, called when the browser disconnects.
 * `Cache-Control: no-transform` stops the compression middleware from
 * buffering the stream.
 */
export function sseResponse(request: Request, subscribe: (send: Send) => () => void): Response {
  const maxMs = maxStreamMs();
  const encoder = new TextEncoder();
  let stop = () => {};
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      let unsubscribe = () => {};
      let ping: ReturnType<typeof setInterval> | null = null;
      let end: ReturnType<typeof setTimeout> | null = null;
      stop = () => {
        if (closed) return;
        closed = true;
        if (ping) clearInterval(ping);
        if (end) clearTimeout(end);
        unsubscribe();
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };
      const write = (chunk: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          stop();
        }
      };
      const send: Send = (event, data) => write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      write("retry: 3000\n\n");
      unsubscribe = subscribe(send);
      ping = setInterval(() => write(": ping\n\n"), 20_000); // keeps proxies from closing idle streams
      if (maxMs > 0) {
        end = setTimeout(() => {
          // Tell the browser this is a planned close, then end the stream; it reconnects in ~1 s.
          write("retry: 1000\nevent: bye\ndata: {}\n\n");
          stop();
        }, maxMs);
      }
      request.signal.addEventListener("abort", () => stop());
    },
    cancel() {
      stop();
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
