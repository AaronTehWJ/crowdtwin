import { useCallback, useEffect, useRef, useState } from 'react';
import type { WorldSpec } from '@crowdtwin/contracts';
import { api, elapsed } from '../api';
import { latestDecision, type Snapshot } from '../simulation';
import { useSimulation } from '../useSimulation';
import { MapCanvas } from './MapCanvas';
import { Telemetry } from './Telemetry';
import { AgentInspector } from './AgentInspector';
import { Comparison, type VariantResult } from './Comparison';
import { RiskDesk } from './RiskDesk';

export function Simulation({ runId, world, view = 'vendor', onUnderwriter }: {
  runId: string; world: WorldSpec; view?: 'vendor' | 'underwriter'; onUnderwriter?: () => void;
}) {
  const { scene, status, reconnect } = useSimulation(runId);
  const [playing, setPlaying] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<number>();
  const [pane, setPane] = useState<'simulation' | 'compare'>('simulation');
  const [variant, setVariant] = useState<VariantResult>();
  const [auditVariant, setAuditVariant] = useState(false);
  const inFlight = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const completed = scene?.run.status === 'COMPLETED';
  const ready = Boolean(scene && status === 'CONNECTED' && !completed);
  useEffect(() => { if (!ready) setPlaying(false); }, [ready]);
  useEffect(() => { setPlaying(false); }, [pane, view]);
  const advance = useCallback(async (steps: number) => {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setError('');
    try { await api<Snapshot>(`/runs/${runId}/step`, { steps }); }
    catch (e) { if (mounted.current) { setError((e as Error).message); setPlaying(false); } }
    finally { inFlight.current = false; if (mounted.current) setBusy(false); }
  }, [runId]);
  useEffect(() => {
    if (!playing || !ready || busy || pane !== 'simulation' || view !== 'vendor') return;
    const timer = setTimeout(() => { void advance(10); }, 250);
    return () => clearTimeout(timer);
  }, [playing, ready, busy, advance, scene?.run.simTimeSec, pane, view]);
  const inspect = (id: number) => { setPlaying(false); setSelected(id); };
  const agent = scene?.agents.find(a => a.agentId === selected);
  return <div className="simulation">
    <nav className="run-nav" aria-label="Run workspace">
      {view === 'vendor' ? <>
        <button aria-pressed={pane === 'simulation'} onClick={() => setPane('simulation')}>Simulation & inspection</button>
        <button aria-pressed={pane === 'compare'} onClick={() => setPane('compare')}>Paired comparison</button>
      </> : <label className="field">Audit run<select value={auditVariant && variant ? 'variant' : 'baseline'} onChange={e => setAuditVariant(e.target.value === 'variant')}>
        <option value="baseline">Approved baseline</option>{variant && <option value="variant">Latest paired intervention</option>}
      </select></label>}
    </nav>
    {view === 'underwriter' ? <RiskDesk key={auditVariant && variant ? variant.runId : runId} runId={auditVariant && variant ? variant.runId : runId} />
      : pane === 'compare' ? <Comparison runId={runId} baseline={scene} result={variant} onResult={setVariant} onAudit={() => { setAuditVariant(true); onUnderwriter?.(); }} />
      :
    <section className="panel">
      <div className="panel-heading"><div><p className="eyebrow">03 / RUST BASELINE</p><h2>A crowd is not a business case.</h2></div><span className="badge">{status === 'CONNECTED' ? 'PUBLIC SUBSCRIPTION' : status}</span></div>
      {status === 'DISCONNECTED' && <div className="error-banner" role="alert">Subscription lost. Playback is paused; displayed data may be stale. <button onClick={reconnect}>Reconnect</button></div>}
      {error && <p role="alert" className="error">{error}</p>}
      {!scene ? <p>Connecting to the approved Rust world…</p> : <>
        <Telemetry booth={scene.booth} />
        <div className="playback">
          <button className="primary" disabled={!ready || busy} onClick={() => { setSelected(undefined); setPlaying(true); }}>Play</button>
          <button disabled={!playing} onClick={() => setPlaying(false)}>Pause</button>
          <button disabled={!ready || busy || playing} onClick={() => { void advance(10); }}>+10x Step</button>
          <button disabled={!ready || busy || playing} onClick={() => { void advance(Math.ceil((scene.run.durationSec - scene.run.simTimeSec) / 30)); }}>Finish baseline</button>
          <strong data-testid="sim-clock">{elapsed(scene.run.simTimeSec)} / {elapsed(scene.run.durationSec)}</strong>
          <span className="badge">{completed ? 'COMPLETED' : playing ? 'PLAYING' : 'PAUSED'}</span>
        </div>
        <progress aria-label="Simulation horizon" max={scene.run.durationSec} value={scene.run.simTimeSec} />
        <div className="simulation-layout">
          <div>
            <MapCanvas world={world} agents={scene.agents} anchors={scene.anchors} boothPosition={scene.booth}
              simTimeSec={scene.run.simTimeSec} playing={playing} onSelect={inspect} selectedId={selected} />
            <div className="legend"><span>Mint: purchased</span><span>Amber: queued</span><span>Coral: rejected</span><span>Grey: moving / leaving</span></div>
            <p className="fine">{scene.agents.length} subscribed customer rows · {scene.agents.filter(a => a.arrivalSec <= scene.run.simTimeSec).length} arrived · Queue {scene.booth.currentQueueLen} · Stock {scene.booth.remainingInventory}</p>
            <p className="fine">Play advances 10 Rust ticks per request (5 simulated minutes). Animation interpolates recorded positions only. Pause stops new requests; an in-flight step may finish.</p>
          </div>
          <div>
            <label className="field">Inspect customer<select value={selected ?? ''} onChange={e => { if (e.target.value !== '') inspect(Number(e.target.value)); }}>
              <option value="">Select a customer or click a dot</option>
              {scene.agents.map(a => <option key={a.agentId} value={a.agentId}>#{a.agentId} · {a.archetype} · {a.lastDecisionId ? 'decision recorded' : 'no decision'}</option>)}
            </select></label>
            {agent ? <AgentInspector key={`${runId}:${agent.agentId}`} agent={agent} event={latestDecision(scene.decisions, runId, agent.agentId)} runId={runId} onClose={() => setSelected(undefined)} /> : <div className="inspector-hint"><p className="eyebrow">04 / FOLLOW THE DECISION</p><h2>Why did they walk away?</h2><p>Click a customer to pause and inspect the exact recorded decision. Unarrived customers have no decision yet.</p></div>}
          </div>
        </div>
        <p className="fine">Seed {scene.run.seed} · Config <code>{scene.run.configHash}</code> · Run <code>{runId}</code></p>
      </>}
    </section>}
  </div>;
}
