import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { App } from '../src/App';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it('explains missing keys and offers explicit fixture loading without substituting evidence', async () => {
  vi.stubGlobal('EventSource', class { close() {} });
  const calls: string[] = [];
  vi.stubGlobal('fetch', vi.fn(async (path: string) => {
    calls.push(path);
    return new Response(JSON.stringify(path === '/api/health'
      ? { ok: true, offline: false, spacetime: 'CONNECTED', apify: 'MISSING_KEY', claude: 'MISSING_KEY', factory: 'MISSING_KEY' }
      : { id: 'failed', stage: 'ERROR', milestones: [], sources: {}, error: { code: 'COLLECTION_FAILED', message: 'Live collection did not produce validated evidence' } }));
  }));
  render(<App />);
  await screen.findByText('Provider keys missing');
  fireEvent.change(screen.getByLabelText('Eventbrite or Luma URL'), { target: { value: 'https://lu.ma/test' } });
  fireEvent.click(screen.getByRole('button', { name: 'Run Live Apify Scrape' }));
  await screen.findByText('APIFY_API_TOKEN is missing. Configure it on the server to collect live evidence.');
  expect((screen.getByRole('button', { name: 'Load Captured Fixture' }) as HTMLButtonElement).disabled).toBe(false);
  expect(screen.queryByText('READ-ONLY EVIDENCE')).toBeNull();
  expect(calls.filter(path => path === '/api/jobs')).toHaveLength(1);
});
it('offers the three saved fixtures with the real Apify snapshot selected by default', async () => {
  vi.stubGlobal('EventSource', class { close() {} });
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(
    { ok: true, offline: true, spacetime: 'CONNECTED', apify: 'OFFLINE', claude: 'OFFLINE', factory: 'OFFLINE' }))));
  render(<App />);
  await screen.findByText('Offline providers');
  const select = screen.getByRole('combobox') as HTMLSelectElement;
  expect(select.closest('label')?.textContent?.startsWith('Saved event fixture')).toBe(true);
  expect(Array.from(select.options).map(option => [option.value, option.textContent])).toEqual([
    ['atl', 'Atlanta festival · Apify snapshot'],
    ['demo', 'ATL festival · modeled demo'],
    ['bay', 'Bay Area market · modeled demo'],
  ]);
  expect(select.value).toBe('atl');
  expect(screen.getByText('Load a saved event to review costs and placement.', { exact: false })).toBeTruthy();
});
