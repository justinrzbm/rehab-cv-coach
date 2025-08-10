// src/lib/live.ts
export function connectLive(onData: (d: any) => void) {
  // Prefer VITE_API_BASE; otherwise default to the current page's origin.
  const base =
    (import.meta as any).env?.VITE_API_BASE ?? window.location.origin;

  // Normalize and build the WS URL (handles http/https → ws/wss and trailing slash).
  const wsUrl = base.replace(/^http/, "ws").replace(/\/$/, "") + "/ws";

  let ws: WebSocket | null = null;
  let ping: ReturnType<typeof setInterval> | null = null;
  let closed = false;
  let retryMs = 1000; // simple backoff on reconnect

  const open = () => {
    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      // reset backoff on successful connection
      retryMs = 1000;
      // keepalive ping to avoid idle timeouts on some proxies
      ping = setInterval(() => {
        if (ws && ws.readyState === WebSocket.OPEN) ws.send("ping");
      }, 20000);
    };

    ws.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data);
        onData(data);
      } catch {
        // ignore non-JSON (e.g., "pong") messages
      }
    };

    ws.onclose = () => {
      if (ping) {
        clearInterval(ping);
        ping = null;
      }
      if (!closed) {
        // simple reconnect with capped backoff
        setTimeout(open, retryMs);
        retryMs = Math.min(retryMs * 2, 8000);
      }
    };

    ws.onerror = () => {
      // Let onclose handle the reconnect/backoff
    };
  };

  open();

  // Return an unsubscribe/cleanup function
  return () => {
    closed = true;
    if (ping) clearInterval(ping);
    ws?.close();
  };
}
