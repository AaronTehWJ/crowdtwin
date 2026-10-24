import { useRef, useState } from 'react';
import type { WorldSpec } from '@crowdtwin/contracts';
import { api, elapsed, money } from '../api';
import type { Booth, Snapshot } from '../simulation';

export type Changes = { relocate: boolean; addServer: boolean; capInventory: boolean };
export type VariantResult = {
  runId: string; baselineId: string; seed: number; horizonSec: number; world: WorldSpec;
  baseline: Snapshot; variant: Snapshot; changes: Changes;
};
const options = [
  ['relocate', 'Relocate Booth to Main Stage Artery', 'Move to the stage X and 100 units below it.'],
  ['addServer', 'Add +1 Server (+$300 labor)', 'Capacity increases, but fixed labor cost also increases.'],
  ['capInventory', 'Cap Inventory Prep at $4,500', 'Only inventory preparation is capped. Booth and labor costs remain.'],
] as const;
const comparisons: { key: keyof Booth; label: string; currency?: boolean }[] = [
  { key: 'grossRevenueCents', label: 'Gross sales', currency: true },
  { key: 'netProfitCents', label: 'Net profit', currency: true },
  { key: 'cashBalanceCents', label: 'Cash balance', currency: true },
  { key: 'totalInventoryOutlayCents', label: 'Inventory outlay', currency: true },
  { key: 'consumedCogsCents', label: 'Consumed COGS', currency: true },
  { key: 'staffEquipmentCents', label: 'Staff + equipment', currency: true },
  { key: 'unitsSold', label: 'Units sold' },
  { key: 'remainingInventory', label: 'Remaining inventory' },
  { key: 'balkedQueueCount', label: 'Balked queue' },
  { key: 'balkedPriceCount', label: 'Balked price' },
];

export function Comparison({ runId, baseline, result, onResult, onAudit }: {
  runId: string; baseline?: Snapshot; result?: VariantResult; onResult: (r: VariantResult) => void; onAudit: () => void;
}) {
  const [changes, setChanges] = useState<Changes>(result?.changes ?? { relocate: false, addServer: false, capInventory: false });
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [error, setError] = useState('');
  const complete = baseline?.run.status === 'COMPLETED';
  const rerun = async () => {
    if (lock.current || !complete || !Object.values(changes).some(Boolean)) return;
    lock.current = true; setBusy(true); setError('');
    try {
      const value = await api<Omit<VariantResult, 'changes'>>(`/runs/${runId}/variants`, changes);
      if (value.baselineId !== runId || value.seed !== baseline.run.seed || value.horizonSec !== baseline.run.simTimeSec)
        throw new Error('The variant did not match the baseline seed and completed horizon');
      onResult({ ...value, changes: { ...changes } });
    } catch (e) { setError((e as Error).message); }
    finally { lock.current = false; setBusy(false); }
  };
  return <section className="panel comparison">
    <div className="panel-heading"><div><p className="eyebrow">05 / PAIRED INTERVENTION</p><h2>Change the setup, not the crowd.</h2></div><span className="badge">SAME SEED · SAME HORIZON</span></div>
    <p className="muted">Rust reruns the completed baseline with stable customer traits. An intervention may reduce cash exposure without improving profit.</p>
    <fieldset disabled={busy} className="interventions">{options.map(([key, label, detail]) => <label key={key}>
      <input type="checkbox" checked={changes[key]} onChange={e => setChanges(c => ({ ...c, [key]: e.target.checked }))} />
      <span><strong>{label}</strong><small>{detail}</small></span>
    </label>)}</fieldset>
    {!complete && <p className="notice">Complete the baseline horizon before rerunning a paired seed.</p>}
    {error && <p role="alert" className="error">{error}</p>}
    <button className="primary" disabled={!complete || busy || !Object.values(changes).some(Boolean)} onClick={() => { void rerun(); }}>{busy ? 'Rust is running the paired world + 45 scenarios…' : 'Rerun Paired Seed'}</button>
    {result && <>
      <div className="result-heading"><h3>Recorded comparison</h3><span>Seed {result.seed} · {elapsed(result.horizonSec)} · both completed</span></div>
      <p className="fine">Applied: {options.filter(([key]) => result.changes[key]).map(([, label]) => label).join(' · ')}</p>
      <div className="table-scroll"><table data-testid="comparison-table"><caption>Actual Rust results, intervention minus baseline</caption><thead><tr><th scope="col">Metric</th><th scope="col">Baseline</th><th scope="col">Intervention</th><th scope="col">Delta</th></tr></thead><tbody>
        {comparisons.map(({ key, label, currency }) => {
          const before = Number(result.baseline.booth[key]); const after = Number(result.variant.booth[key]);
          const format = (n: number) => currency ? money(n) : n.toLocaleString('en-US');
          return <tr key={key}><th scope="row">{label}</th><td>{format(before)}</td><td>{format(after)}</td><td>{format(after - before)}</td></tr>;
        })}
      </tbody></table></div>
      <p className="notice">Profit and cash answer different questions. Unsold inventory is a cash outlay, but is not consumed COGS. No improved outcome is guaranteed.</p>
      <button onClick={onAudit}>Inspect intervention risk</button>
      <details><summary>Paired run identifiers and configuration hashes</summary><p className="fine">Baseline: {result.baselineId}<br />{result.baseline.run.configHash}<br />Intervention: {result.runId}<br />{result.world.configHash}</p></details>
    </>}
  </section>;
}
