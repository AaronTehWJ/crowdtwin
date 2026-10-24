import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ValidatedWorldSchema } from '@crowdtwin/contracts/validation';
import fixture from '../../../fixtures/default-world-spec.json';
import { interpolate, jsonNumbers, latestDecision, type Agent, type Booth, type RecordedDecision, type Scene } from '../src/simulation';
import { AgentInspector } from '../src/components/AgentInspector';
import { Telemetry } from '../src/components/Telemetry';
import { Simulation } from '../src/components/Simulation';
import { useSimulation } from '../src/useSimulation';

vi.mock('../src/useSimulation', () => ({ useSimulation: vi.fn() }));
const agent = { agentId: 7, archetype: 'Food explorers', state: 'ENTERING', walletCents: 2200, maxWaitSec: 180, arrivalSec: 0, lastDecisionId: '' } as Agent;
const event = { eventId: 'run:decision:7', runId: 'run', agentId: 7, simTimeSec: 90, reason: 'BALKED_QUEUE_WAIT', estimatedWaitSec: 300, agentWalletCents: 2200 } as RecordedDecision;
const booth = { grossRevenueCents: 219600, netProfitCents: -1019480, cashBalanceCents: -2146280, totalInventoryOutlayCents: 1200000, consumedCogsCents: 73200, organizerFeeCents: 65880, unitsSold: 122 } as Booth;
beforeEach(() => { vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers(); });

it('converts database bigint values without silently losing precision', () => {
  expect(jsonNumbers({ cash: -2146280n })).toEqual({ cash: -2146280 });
  expect(() => jsonNumbers({ cash: 9007199254740993n })).toThrow(/precision/);
});
it('interpolates only between recorded positions, never beyond them', () => {
  expect(interpolate({ x: 0, y: 10 }, { x: 100, y: 50 }, 0.5)).toEqual({ x: 50, y: 30 });
  expect(interpolate({ x: 0, y: 10 }, { x: 100, y: 50 }, 9)).toEqual({ x: 100, y: 50 });
});
it('selects only the exact run and customer decision', () => {
  expect(latestDecision([event, { ...event, runId: 'other', simTimeSec: 1000 }], 'run', 7)).toEqual(event);
  expect(latestDecision([event], 'run', 8)).toBeUndefined();
});
it('separates net profit, cash, inventory outlay and consumed COGS', () => {
  render(<Telemetry booth={booth} />);
  for (const amount of ['$2,196.00', '-$10,194.80', '-$21,462.80', '$12,000.00', '$732.00']) expect(screen.getByText(amount)).toBeTruthy();
});
it('does not request an explanation before a decision exists', () => {
  const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
  render(<AgentInspector agent={agent} runId="run" onClose={() => undefined} />);
  expect(screen.getByText(/No recorded decision/)).toBeTruthy();
  expect(fetch).not.toHaveBeenCalled();
});
it('fetches the exact recorded event and labels a fallback narrative', async () => {
  const fetch = vi.fn(async () => new Response(JSON.stringify({ event, source: 'DETERMINISTIC_FALLBACK', explanation: 'Recorded queue wait. Recorded rejection.' })));
  vi.stubGlobal('fetch', fetch);
  render(<AgentInspector agent={agent} event={event} runId="run" onClose={() => undefined} />);
  await screen.findByText('Deterministic fallback');
  expect(JSON.parse(fetch.mock.calls[0]![1]!.body as string)).toEqual({ eventId: event.eventId });
  expect(JSON.parse(screen.getByTestId('decision-json').textContent!)).toEqual(event);
});
it('pauses playback when a customer is selected, without starting a new step', () => {
  vi.useFakeTimers();
  const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
  vi.mocked(useSimulation).mockReturnValue({
    scene: { run: { runId: 'run', status: 'RUNNING', simTimeSec: 0, durationSec: 28800 }, booth, agents: [agent], decisions: [], anchors: [] } as unknown as Scene,
    status: 'CONNECTED', reconnect: vi.fn(),
  });
  render(<Simulation runId="run" world={ValidatedWorldSchema.parse(fixture)} />);
  fireEvent.click(screen.getByRole('button', { name: 'Play', exact: true }));
  fireEvent.change(screen.getByLabelText('Inspect customer'), { target: { value: '7' } });
  vi.advanceTimersByTime(1000);
  expect(fetch).not.toHaveBeenCalled();
  expect((screen.getByRole('button', { name: 'Pause', exact: true }) as HTMLButtonElement).disabled).toBe(true);
});
it('prevents overlapping manual steps', async () => {
  let resolve!: (response: Response) => void;
  const fetch = vi.fn(() => new Promise<Response>(r => { resolve = r; })); vi.stubGlobal('fetch', fetch);
  vi.mocked(useSimulation).mockReturnValue({
    scene: { run: { runId: 'run', status: 'RUNNING', simTimeSec: 0, durationSec: 28800 }, booth, agents: [], decisions: [], anchors: [] } as unknown as Scene,
    status: 'CONNECTED', reconnect: vi.fn(),
  });
  render(<Simulation runId="run" world={ValidatedWorldSchema.parse(fixture)} />);
  const step = screen.getByRole('button', { name: '+10x Step' });
  fireEvent.click(step); fireEvent.click(step);
  expect(fetch).toHaveBeenCalledTimes(1);
  resolve(new Response('{}'));
  await waitFor(() => expect((step as HTMLButtonElement).disabled).toBe(false));
});
