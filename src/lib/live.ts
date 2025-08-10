export function connectLive(onData: (d:any)=>void) {
  const ws = new WebSocket("ws://localhost:8000/ws");
  let pingId: any;
  ws.onopen = () => {
    pingId = setInterval(() => ws.readyState === 1 && ws.send("ping"), 15000);
  };
  ws.onmessage = (e) => { try { onData(JSON.parse(e.data)); } catch {} };
  ws.onclose = () => { if (pingId) clearInterval(pingId); };
  return () => { if (pingId) clearInterval(pingId); ws.close(); };
}