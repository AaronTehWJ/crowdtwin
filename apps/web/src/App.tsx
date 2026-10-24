import { useEffect, useState } from 'react';
import type { WorldSpec } from '@crowdtwin/contracts';
import type { CostConfirmation } from '@crowdtwin/contracts/validation';
import { api, sourceLabel, type Health, type Intake, type Job } from './api';
import { useJob } from './useJob';
import { Review } from './components/Review';
import { Evidence } from './components/Evidence';

export function App() {
  const [health, setHealth] = useState<Health>();
  const [jobId, setJobId] = useState<string>();
  const [fixture, setFixture] = useState<'atl' | 'bay'>('atl');
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [approved, setApproved] = useState<{ runId: string; world: WorldSpec }>();
  const [view, setView] = useState<'vendor' | 'underwriter'>('vendor');
  const { job, error: progressError } = useJob(jobId);
  const world = approved?.world ?? job?.world;
  useEffect(() => {
    const controller = new AbortController();
    void api<Health>('/health', undefined, controller.signal).then(setHealth).catch(() => {
      if (!controller.signal.aborted) setError('Local services are unavailable. Start SpacetimeDB and the API, then refresh.');
    });
    return () => controller.abort();
  }, []);
  const start = async (input: Intake) => {
    setBusy(true); setError(''); setApproved(undefined); setJobId(undefined);
    try { setJobId((await api<Job>('/jobs', input)).id); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };
  const approve = async (world: WorldSpec, costs: CostConfirmation) => {
    setBusy(true); setError('');
    try { setApproved(await api(`/jobs/${jobId}/approve`, { world, costs })); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };
  const working = busy || Boolean(jobId && (!job || !['AWAITING_APPROVAL', 'APPROVED', 'ERROR', 'COLLECTION_TIMEOUT'].includes(job.stage)));
  return <div className="app">
    <header className="topbar"><a className="brand" href="/"><span className="brand-mark">ct</span><span>CrowdTwin<small>EVENT ECONOMICS STUDIO</small></span></a>
      <nav className="view-switch" aria-label="Studio view">
        <button aria-pressed={view === 'vendor'} onClick={() => setView('vendor')}>1 · Vendor Sandbox</button>
        <button aria-pressed={view === 'underwriter'} onClick={() => setView('underwriter')}>2 · Underwriter Desk</button>
      </nav>
      <div className="status"><span className="status-dot" /><span>{health?.offline ? 'Offline providers' : health ? 'Live providers configured separately' : 'Connecting locally'}</span>
        <span className="badge">{world?.evidence.provenance ?? 'NO EVIDENCE'}{world?.evidence.provenance === 'CAPTURED' ? ' · MODELED DEMO' : ''}</span></div>
    </header>
    <div className="runtime-note">LOCAL PROTOTYPE <span>Live Droid coordination is blocked by the runtime tool restriction. Offline coordination is deterministic.</span></div>
    <main>
      <section className="intro"><div><p className="eyebrow">DECISIONS BEFORE COMMITMENTS</p><h1>Test the crowd.<br /><span>Know the cost.</span></h1></div>
        <p>Turn event assumptions into an inspectable micro-market.<br />Every purchase, queue, and dollar comes from Rust.</p></section>
      <div className="workspace">
        <aside className="sidebar">
          <section className="panel intake"><p className="eyebrow">01 / EVENT INTAKE</p><h2>Choose your event</h2>
            <label className="field">Modeled demo fixture<select disabled={working} value={fixture} onChange={e => setFixture(e.target.value as 'atl' | 'bay')}><option value="atl">ATL festival</option><option value="bay">Bay Area market</option></select></label>
            <button className="primary wide" disabled={working} onClick={() => { void start({ mode: 'CAPTURED', fixture }); }}>Load Captured Fixture</button>
            <div className="separator">or collect public evidence</div>
            <form onSubmit={e => { e.preventDefault(); void start({ mode: 'LIVE', url }); }}>
              <label className="field">Eventbrite or Luma URL<input type="url" required maxLength={2048} placeholder="https://lu.ma/your-event" value={url} disabled={working} onChange={e => setUrl(e.target.value)} /></label>
              <button className="wide" disabled={working}>Run Live Apify Scrape</button>
            </form>
            <p className="fine">A live failure never silently loads demo evidence. Use the fixture button explicitly.</p>
            {job && <div className="progress" aria-live="polite"><strong>{job.stage.replaceAll('_', ' ')}</strong><ol>{job.milestones.map(m => <li key={m.id}>{m.message}</li>)}</ol></div>}
            {job?.sources.map && <p className="fine">Map: {sourceLabel(job.sources.map)}<br />Personas: {sourceLabel(job.sources.personas)}<br />Coordinator: {sourceLabel(job.sources.coordinator)}</p>}
          </section>
          {world && <Evidence world={world} />}
        </aside>
        <div className="studio">
          {(error || job?.error || progressError) && <div className="error-banner" role="alert">{error || job?.error?.message || progressError}{job?.error && <p>Load Captured Fixture to continue with modeled demo evidence.</p>}</div>}
          {!world && <section className="panel empty-state"><div className="orbital"><i /><i /><i /><b>ct</b></div><p className="eyebrow">A SMALL WORLD. A CLEARER DECISION.</p><h2>What does a full crowd<br />actually mean for your booth?</h2><p>Load a modeled event to review costs and placement.<br />Nothing runs until you approve the assumptions.</p><div className="empty-steps"><span>01 Evidence</span><span>02 Review</span><span>03 Simulate</span><span>04 Inspect</span><span>05 Compare</span><span>06 Underwrite</span></div></section>}
          {world && !approved && job?.stage === 'AWAITING_APPROVAL' && <Review key={job.id} initial={world} busy={busy} onApprove={approve} />}
          {world && !approved && job?.stage !== 'AWAITING_APPROVAL' && <section className="panel"><h2>{job?.stage === 'INITIALIZING' ? 'Preparing your Rust world…' : 'Drafting the review…'}</h2><p>No model can approve assumptions on your behalf.</p></section>}
          {approved && <section className="panel"><p className="eyebrow">HUMAN APPROVED</p><h2>Rust world ready</h2><p>Run <code>{approved.runId}</code> has been initialized. Simulation controls and the {view === 'vendor' ? 'agent inspector' : 'risk desk'} are the next studio chunk.</p></section>}
        </div>
      </div>
    </main>
    <footer><span>CrowdTwin / Local decision support</span><span>Modeled outcomes, not forecasts. No funding authorization.</span></footer>
  </div>;
}
