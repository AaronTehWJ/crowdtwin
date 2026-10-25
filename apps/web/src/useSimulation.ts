import { useEffect, useState } from 'react';
import { api, type Health } from './api';
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
    const connect = async () => {
      try {
        const health = await api<Health>('/health');
        if (disposed) return;
        const uri = import.meta.env.VITE_SPACETIMEDB_URI || health.database?.uri;
        const name = import.meta.env.VITE_SPACETIMEDB_DB_NAME || health.database?.name;
        if (!uri || !name) throw new Error('Database configuration missing');
        const address = new URL(uri);
        if (!['http:', 'https:', 'ws:', 'wss:'].includes(address.protocol) ||
          address.username || address.password || !/^[a-z0-9-]+$/.test(name) || !/^[a-zA-Z0-9_-]{1,80}$/.test(runId))
          throw new Error('Invalid database subscription configuration');
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
    };
    void connect();
    return () => { disposed = true; cancelAnimationFrame(frame); connection?.disconnect(); };
  }, [runId, attempt]);
  return { scene, status, reconnect: () => setAttempt(n => n + 1) };
}
