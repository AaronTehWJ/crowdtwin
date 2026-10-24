import { useEffect, useState } from 'react';
import { DbConnection } from './module_bindings';
import { jsonNumbers, type Scene } from './simulation';

export function useSimulation(runId: string) {
  const [scene, setScene] = useState<Scene>();
  const [status, setStatus] = useState('CONNECTING');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    setScene(undefined); setStatus('CONNECTING');
    let connection: DbConnection | undefined;
    let disposed = false;
    let frame = 0;
    const fail = () => { if (!disposed) setStatus('DISCONNECTED'); };
    try {
      const uri = import.meta.env.VITE_SPACETIMEDB_URI || 'http://127.0.0.1:3000';
      const name = import.meta.env.VITE_SPACETIMEDB_DB_NAME || 'crowdtwin';
      const address = new URL(uri);
      if (!['localhost', '127.0.0.1'].includes(address.hostname) || address.protocol !== 'http:' ||
        address.username || address.password || !/^[a-z0-9-]+$/.test(name) || !/^[a-zA-Z0-9_-]{1,80}$/.test(runId))
        throw new Error('Only a local public subscription is supported');
      connection = DbConnection.builder().withUri(uri).withModuleName(name)
        .onConnect(conn => {
          if (disposed) { conn.disconnect(); return; }
          const read = () => {
            frame = 0;
            if (disposed) return;
            try {
              const run = [...conn.db.runState.iter()].find(row => row.runId === runId);
              const booth = [...conn.db.booth.iter()].find(row => row.runId === runId);
              if (!run || !booth) return;
              setScene({
                run: jsonNumbers(run), booth: jsonNumbers(booth),
                agents: [...conn.db.customerAgent.iter()].filter(row => row.runId === runId).map(jsonNumbers).sort((a, b) => a.agentId - b.agentId),
                decisions: [...conn.db.decisionEvent.iter()].filter(row => row.runId === runId).map(jsonNumbers),
                anchors: [...conn.db.anchorNode.iter()].filter(row => row.runId === runId).map(jsonNumbers),
              });
            } catch { fail(); }
          };
          const schedule = () => { if (!disposed && !frame) frame = requestAnimationFrame(read); };
          for (const table of [conn.db.runState, conn.db.booth, conn.db.customerAgent, conn.db.decisionEvent, conn.db.anchorNode]) {
            table.onInsert(schedule); table.onUpdate(schedule); table.onDelete(schedule);
          }
          conn.subscriptionBuilder()
            .onApplied(() => { if (!disposed) { setStatus('CONNECTED'); read(); } })
            .onError(fail)
            .subscribe(['run_state', 'booth', 'customer_agent', 'decision_event', 'anchor_node'].map(table => `SELECT * FROM ${table} WHERE run_id = '${runId}'`));
        })
        .onConnectError(fail).onDisconnect(fail).build();
    } catch { fail(); }
    return () => { disposed = true; cancelAnimationFrame(frame); connection?.disconnect(); };
  }, [runId, attempt]);
  return { scene, status, reconnect: () => setAttempt(n => n + 1) };
}
