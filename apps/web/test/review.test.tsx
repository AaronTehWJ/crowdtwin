import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ValidatedWorldSchema } from '@crowdtwin/contracts/validation';
import fixture from '../../../fixtures/default-world-spec.json';
import { Review } from '../src/components/Review';
import { Evidence } from '../src/components/Evidence';
import { normalizedPoint } from '../src/components/MapCanvas';
import { money } from '../src/api';
import { useJob } from '../src/useJob';

beforeEach(() => { vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('human review', () => {
  it('keeps evidence read-only and labels modeled fixtures honestly', () => {
    render(<Evidence world={ValidatedWorldSchema.parse(fixture)} />);
    expect(screen.getByText('CAPTURED · MODELED DEMO')).toBeTruthy();
    expect(screen.getByText('None (not a live actor run)')).toBeTruthy();
    expect(screen.queryAllByRole('textbox')).toHaveLength(0);
  });
  it('never approves on render and keeps unknown costs separate from confirmed zero', async () => {
    const approve = vi.fn().mockResolvedValue(undefined);
    const world = ValidatedWorldSchema.parse(fixture);
    render(<Review initial={world} busy={false} onApprove={approve} />);
    expect(approve).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Booth fee ($)'), { target: { value: '0' } });
    fireEvent.click(screen.getByRole('button', { name: 'Approve Setup & Seed World' }));
    await waitFor(() => expect(approve).toHaveBeenCalledTimes(1));
    expect(approve.mock.calls[0]![0].vendorBooth.boothFeeCents).toBe(0);
    expect(approve.mock.calls[0]![1].boothFeeCents).toBe(false);
    fireEvent.click(screen.getByLabelText('Confirmed Booth fee ($)'));
    fireEvent.click(screen.getByRole('button', { name: 'Approve Setup & Seed World' }));
    expect(approve.mock.calls[1]![1].boothFeeCents).toBe(true);
    expect(approve.mock.calls[1]![0].evidence).toEqual(world.evidence);
    expect(world.vendorBooth.boothFeeCents).toBe(600000);
  });
  it('blocks approval for invalid economics and missing indoor image', () => {
    const approve = vi.fn();
    render(<Review initial={ValidatedWorldSchema.parse(fixture)} busy={false} onApprove={approve} />);
    fireEvent.change(screen.getByLabelText('Prep time (sec)'), { target: { value: '0' } });
    const button = screen.getByRole('button', { name: 'Approve Setup & Seed World' }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Prep time (sec)'), { target: { value: '90' } });
    fireEvent.change(screen.getByLabelText('Map mode'), { target: { value: 'INDOOR_IMAGE' } });
    expect(button.disabled).toBe(true);
    fireEvent.click(button);
    expect(approve).not.toHaveBeenCalled();
  });
  it('normalizes booth coordinates without allowing points outside the venue', () => {
    const bounds = { left: 20, top: 30, width: 500, height: 500 };
    expect(normalizedPoint(270, 280, bounds)).toEqual({ x: 500, y: 500 });
    expect(normalizedPoint(-10, 900, bounds)).toEqual({ x: 0, y: 1000 });
    expect(money(-1019480)).toBe('-$10,194.80');
  });
});

it('loads replayed progress and closes old SSE subscriptions', async () => {
  const sources: { close: ReturnType<typeof vi.fn>; onmessage?: () => void }[] = [];
  vi.stubGlobal('EventSource', class {
    close = vi.fn();
    constructor() { sources.push(this); }
  });
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
    id: 'first', stage: 'AWAITING_APPROVAL', milestones: [], sources: {},
  }), { status: 200 })));
  function Progress({ id }: { id: string }) { const { job } = useJob(id); return <p>{job?.stage}</p>; }
  const { rerender, unmount } = render(<Progress id="first" />);
  await screen.findByText('AWAITING_APPROVAL');
  rerender(<Progress id="second" />);
  expect(sources[0]!.close).toHaveBeenCalled();
  unmount();
  expect(sources[1]!.close).toHaveBeenCalled();
});
