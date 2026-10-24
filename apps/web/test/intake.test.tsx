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
