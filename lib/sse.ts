import "server-only";

type Send = (event: string, data: unknown) => void;

/**
 * Server-Sent Events response. `subscribe` receives a `send` function and
 * returns an unsubscribe callback, called when the browser disconnects.
 * `Cache-Control: no-transform` stops the compression middleware from
 * buffering the stream.
 */
export function sseResponse(request: Request, subscribe: (send: Send) => () => void): Response {
  const encoder = new TextEncoder();
  let stop = () => {};
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      let unsubscribe = () => {};
      let ping: ReturnType<typeof setInterval> | null = null;
      stop = () => {
        if (closed) return;
        closed = true;
        if (ping) clearInterval(ping);
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
