import { useEffect, useRef, useState } from 'react';
import { api, elapsed, money, sourceLabel } from '../api';
import type { Agent, RecordedDecision } from '../simulation';

type Explanation = { event: RecordedDecision; explanation: string; source: string };
export function AgentInspector({ agent, event, runId, onClose }: {
  agent: Agent; event?: RecordedDecision; runId: string; onClose: () => void;
}) {
  const [explanation, setExplanation] = useState<Explanation>();
  const [error, setError] = useState('');
  const close = useRef<HTMLButtonElement>(null);
  useEffect(() => { close.current?.focus(); }, []);
  useEffect(() => {
    setExplanation(undefined); setError('');
    if (!event) return;
    const controller = new AbortController();
    void api<Explanation>(`/runs/${runId}/explain`, { eventId: event.eventId }, controller.signal).then(value => {
      if (value.event.eventId !== event.eventId || value.event.runId !== runId || value.event.agentId !== agent.agentId)
        throw new Error('Explanation did not match the selected recorded decision');
      if (!controller.signal.aborted) setExplanation(value);
    }).catch(e => { if (!controller.signal.aborted) setError((e as Error).message); });
    return () => controller.abort();
  }, [event?.eventId, runId, agent.agentId]);
  return <aside className="panel inspector" aria-label="Agent inspector" onKeyDown={e => { if (e.key === 'Escape') onClose(); }}>
    <div className="panel-heading"><div><p className="eyebrow">04 / PAUSED TO INSPECT</p><h2>Customer #{agent.agentId}</h2></div><button ref={close} onClick={onClose} aria-label="Close inspector">Close</button></div>
    <p>{agent.archetype} · {agent.state.replaceAll('_', ' ')}</p>
    <p className="muted">Current wallet {money(agent.walletCents)} · Patience {agent.maxWaitSec}s</p>
    {!event ? <p className="notice">No recorded decision for this customer yet. No explanation has been invented.</p> : <>
      <p className="eyebrow">RECORDED AT {elapsed(event.simTimeSec)}</p>
      <h3>{event.reason.replaceAll('_', ' ')}</h3>
      {explanation ? <div className="explanation"><span className="badge">{sourceLabel(explanation.source)}</span><p>{explanation.explanation}</p></div> : <p aria-live="polite">{error || 'Reading the exact decision…'}</p>}
      <details open><summary>Raw deterministic DecisionEvent</summary><pre data-testid="decision-json">{JSON.stringify(event, null, 2)}</pre></details>
      <p className="fine">Recorded wallet, price, wait, and stock are authoritative. Narrative does not modify them.</p>
    </>}
  </aside>;
}
