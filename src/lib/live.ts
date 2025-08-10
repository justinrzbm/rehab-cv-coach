export function connectLive(onData: (d:any)=>void) {
  const ws = new WebSocket("ws://localhost:8000/ws");
  ws.onopen = () => {
    const t = setInterval(() => ws.readyState === 1 && ws.send("ping"), 15000);
    // @ts-ignore
    ws._t = t;
  };
  ws.onmessage = (e) => { try { onData(JSON.parse(e.data)); } catch {} };
  ws.onclose = () => { /* @ts-ignore */ clearInterval(ws._t); };
  return () => ws.close();
}