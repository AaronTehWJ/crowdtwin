import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { AuditReport } from '@crowdtwin/contracts';
import { Comparison, type VariantResult } from '../src/components/Comparison';
import { RiskDesk } from '../src/components/RiskDesk';
import type { Snapshot } from '../src/simulation';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const snapshot = { run: { status: 'COMPLETED', seed: 42, simTimeSec: 28800 } } as Snapshot;
const report: AuditReport & { narrativeSource: string; coordinatorSource: string } = {
  runId: 'baseline', configHash: 'hash', provenance: 'CAPTURED', policyVerdict: 'REJECT', recommendedCapCents: 450000,
  bottleneckDiagnosis: 'Price affordability.', droidDiffText: '- Prepared inventory\n+ Inventory cap only', narrativeMarkdown: 'Recorded losses. No funding authorization.',
  narrativeSource: 'DETERMINISTIC_FALLBACK', coordinatorSource: 'DETERMINISTIC_FALLBACK',
  scenarios: (['LOW', 'BASE', 'HIGH'] as const).map((scenarioName, i) => ({
    scenarioName, turnoutCount: [200, 400, 560][i]!, seedsRun: 15, profitableRuns: 0,
    medianRevenueCents: 219600, medianProfitCents: -1019480, downsideP10ProfitCents: -1060400,
    medianBalkedQueue: 51, medianBalkedPrice: 172,
  })),
};
it('blocks variants before the baseline completes and before a change is selected', () => {
  const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
  render(<Comparison runId="baseline" baseline={{ ...snapshot, run: { ...snapshot.run, status: 'RUNNING' } }} onResult={vi.fn()} onAudit={vi.fn()} />);
  fireEvent.click(screen.getByLabelText(/Cap Inventory Prep/));
  const rerun = screen.getByRole('button', { name: 'Rerun Paired Seed' }) as HTMLButtonElement;
  expect(rerun.disabled).toBe(true);
  fireEvent.click(rerun);
  expect(fetch).not.toHaveBeenCalled();
});
it('posts interventions to the baseline, checks seed/horizon and does not rewrite results', async () => {
  const result = { baselineId: 'baseline', seed: 42, horizonSec: 28800, runId: 'variant', world: {}, baseline: snapshot, variant: snapshot } as VariantResult;
  const fetch = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify(result)));
  vi.stubGlobal('fetch', fetch);
  const onResult = vi.fn();
  render(<Comparison runId="baseline" baseline={snapshot} onResult={onResult} onAudit={vi.fn()} />);
  fireEvent.click(screen.getByLabelText(/Add \+1 Server/));
  fireEvent.click(screen.getByRole('button', { name: 'Rerun Paired Seed' }));
  await waitFor(() => expect(onResult).toHaveBeenCalledTimes(1));
  expect(fetch.mock.calls[0]![0]).toBe('/api/runs/baseline/variants');
  expect(JSON.parse(fetch.mock.calls[0]![1]!.body as string)).toEqual({ relocate: false, addServer: true, capInventory: false });
  expect(onResult.mock.calls[0]![0].variant).toEqual(snapshot);
});
it('refuses a mismatched paired horizon', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ baselineId: 'baseline', seed: 42, horizonSec: 600 }))));
  const onResult = vi.fn();
  render(<Comparison runId="baseline" baseline={snapshot} onResult={onResult} onAudit={vi.fn()} />);
  fireEvent.click(screen.getByLabelText(/Cap Inventory Prep/));
  fireEvent.click(screen.getByRole('button', { name: 'Rerun Paired Seed' }));
  await screen.findByText(/did not match/);
  expect(onResult).not.toHaveBeenCalled();
});
it('shows actual three summaries and deterministic policy without claiming Droid usage', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(report))));
  render(<RiskDesk runId="baseline" />);
  await screen.findByText('REJECT');
  expect(screen.getAllByText('0/15')).toHaveLength(3);
  expect(screen.getByText('$4,500.00')).toBeTruthy();
  expect(screen.getByText('Deterministic fallback')).toBeTruthy();
  expect(screen.getByText(/not loans or fund transfers/)).toBeTruthy();
});
it('preserves NEEDS_INPUT and ignores a response from a previously selected audit run', async () => {
  let resolve!: (r: Response) => void;
  vi.stubGlobal('fetch', vi.fn()
    .mockImplementationOnce(() => new Promise<Response>(r => { resolve = r; }))
    .mockResolvedValueOnce(new Response(JSON.stringify({ ...report, runId: 'new', policyVerdict: 'NEEDS_INPUT' }))));
  const { rerender } = render(<RiskDesk runId="old" />);
  rerender(<RiskDesk runId="new" />);
  await screen.findByText('NEEDS_INPUT');
  resolve(new Response(JSON.stringify({ ...report, runId: 'old' })));
  await waitFor(() => expect(screen.getByTestId('policy-verdict').textContent).toBe('NEEDS_INPUT'));
});
