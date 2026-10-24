import { useEffect, useState } from 'react';
import type { WorldSpec } from '@crowdtwin/contracts';
import type { CostConfirmation } from '@crowdtwin/contracts/validation';
import { api, evidenceLabel, sourceLabel, type Health, type Intake, type Job } from './api';
import { useJob } from './useJob';
import { Review } from './components/Review';
import { Evidence } from './components/Evidence';
import { Simulation } from './components/Simulation';

export function App() {
  const [health, setHealth] = useState<Health>();
  const [jobId, setJobId] = useState<string>();
  const [fixture, setFixture] = useState<'atl' | 'demo' | 'bay'>('atl');
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
  const working = busy || Boolean(jobId && !progressError && (!job || !['AWAITING_APPROVAL', 'APPROVED', 'ERROR', 'COLLECTION_TIMEOUT'].includes(job.stage)));
  return <div className="app">
    <header className="topbar"><a className="brand" href="/"><span className="brand-mark">ct</span><span>CrowdTwin<small>EVENT ECONOMICS STUDIO</small></span></a>
      <nav className="view-switch" aria-label="Studio view">
        <button aria-pressed={view === 'vendor'} onClick={() => setView('vendor')}>1 · Vendor Sandbox</button>
        <button aria-pressed={view === 'underwriter'} onClick={() => setView('underwriter')}>2 · Underwriter Desk</button>
      </nav>
      <div className="status"><span className="status-dot" /><span>{health?.offline ? 'Offline providers' : health ? [health.apify, health.claude, health.factory].includes('MISSING_KEY') ? 'Provider keys missing' : 'Providers configured, unverified' : 'Connecting locally'}</span>
        <span className="badge">{evidenceLabel(world?.evidence)}</span></div>
    </header>
    <div className="runtime-note">LOCAL PROTOTYPE <span>Live Droid coordination is blocked by the runtime tool restriction. Offline coordination is deterministic.</span></div>
    <main>
      <section className="intro"><div><p className="eyebrow">DECISIONS BEFORE COMMITMENTS</p><h1>Test the crowd.<br /><span>Know the cost.</span></h1></div>
        <p>Turn event assumptions into an inspectable micro-market.<br />Every purchase, queue, and dollar comes from Rust.</p></section>
      <div className="workspace">
        <aside className="sidebar">
          <section className="panel intake"><p className="eyebrow">01 / EVENT INTAKE</p><h2>Choose your event</h2>
            <label className="field">Saved event fixture<select disabled={working} value={fixture} onChange={e => setFixture(e.target.value as 'atl' | 'demo' | 'bay')}><option value="atl">Atlanta festival · Apify snapshot</option><option value="demo">ATL festival · modeled demo</option><option value="bay">Bay Area market · modeled demo</option></select></label>
            <button className="primary wide" disabled={working} onClick={() => { void start({ mode: 'CAPTURED', fixture }); }}>Load Captured Fixture</button>
            <div className="separator">or collect public evidence</div>
            <form onSubmit={e => { e.preventDefault(); void start({ mode: 'LIVE', url }); }}>
              <label className="field">Eventbrite or Luma URL<input type="url" required maxLength={2048} placeholder="https://lu.ma/your-event" value={url} disabled={working} onChange={e => setUrl(e.target.value)} /></label>
              <button className="wide" disabled={working}>Run Live Apify Scrape</button>
            </form>
            <p className="fine">A live failure never silently loads demo evidence. Use the fixture button explicitly.</p>
            {health && <details><summary>Local service status</summary><dl className="health-status"><dt>Database</dt><dd>{health.spacetime}</dd><dt>Apify</dt><dd>{health.apify}</dd><dt>Claude</dt><dd>{health.claude}</dd><dt>Factory</dt><dd>{health.factory}</dd></dl></details>}
            {job && <div className="progress" aria-live="polite"><strong>{job.stage.replaceAll('_', ' ')}</strong><ol>{job.milestones.map(m => <li key={m.id}>{m.message}</li>)}</ol></div>}
            {job?.sources.map && <p className="fine">Map: {sourceLabel(job.sources.map)}<br />Personas: {sourceLabel(job.sources.personas)}<br />Coordinator: {sourceLabel(job.sources.coordinator)}</p>}
          </section>
          {world && <Evidence world={world} />}
        </aside>
        <div className="studio">
          {(error || job?.error || progressError) && <div className="error-banner" role="alert">{error || job?.error?.message || progressError}{job?.error && <>
            {health?.apify === 'MISSING_KEY' && <p>APIFY_API_TOKEN is missing. Configure it on the server to collect live evidence.</p>}
            {health?.offline && <p>Live collection is disabled in offline mode.</p>}
            <p>Load Captured Fixture to continue with saved evidence. Modeled demos are labeled separately.</p>
          </>}</div>}
          {!world && <section className="panel empty-state"><div className="orbital"><i /><i /><i /><b>ct</b></div><p className="eyebrow">A SMALL WORLD. A CLEARER DECISION.</p><h2>What does a full crowd<br />actually mean for your booth?</h2><p>Load a saved event to review costs and placement.<br />Nothing runs until you approve the assumptions.</p><div className="empty-steps"><span>01 Evidence</span><span>02 Review</span><span>03 Simulate</span><span>04 Inspect</span><span>05 Compare</span><span>06 Underwrite</span></div></section>}
          {world && !approved && job?.stage === 'AWAITING_APPROVAL' && <Review key={job.id} initial={world} busy={busy} onApprove={approve} />}
          {world && !approved && job?.stage !== 'AWAITING_APPROVAL' && <section className="panel"><h2>{job?.stage === 'INITIALIZING' ? 'Preparing your Rust world…' : 'Drafting the review…'}</h2><p>No model can approve assumptions on your behalf.</p></section>}
          {approved && <Simulation key={approved.runId} runId={approved.runId} world={approved.world} view={view} onUnderwriter={() => setView('underwriter')} />}
        </div>
      </div>
    </main>
    <footer><span>CrowdTwin / Local decision support</span><span>Modeled outcomes, not forecasts. No funding authorization.</span></footer>
  </div>;
}
