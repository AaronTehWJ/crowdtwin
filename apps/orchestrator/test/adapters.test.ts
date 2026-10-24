import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { apifyInput, assertEventIdentity, collectLive, defaultWorld, loadFixture, normalizeEvidence, validateEventUrl } from '../src/apifyAdapter.js';
import { ClaudeService } from '../src/claudeService.js';
import { providers } from '../src/config.js';
import { boundInput } from '../src/errors.js';
import { riskPolicy, unknownCosts } from '../src/policy.js';

test('URL allowlist rejects spoofed hosts, credentials, protocols and ports', () => {
  for (const url of ['http://eventbrite.com/e/a', 'https://eventbrite.com.evil.org/a', 'https://user@lu.ma/a', 'https://luma.com:999/a', 'https://www.lu.ma/a', 'file:///etc/passwd']) assert.throws(() => validateEventUrl(url));
  for (const host of ['eventbrite.com', 'www.eventbrite.com', 'lu.ma', 'luma.com']) assert.match(validateEventUrl(`https://${host}/event`), /^https:/);
});
test('actor input uses string URLs and disables organizer enrichment and harvesting', () => {
  assert.deepEqual(apifyInput('https://www.eventbrite.com/e/example'), {
    startUrls: ['https://www.eventbrite.com/e/example'], maxItems: 1,
    enrichOrganizer: false, harvestOrganizerEmails: false, monitoringMode: false,
  });
});
test('event identity check accepts the requested Eventbrite event and rejects substitutes', () => {
  const url = 'https://www.eventbrite.com/e/atlanta-handmade-food-small-business-festival-2026-tickets-1995040808764';
  assert.doesNotThrow(() => assertEventIdentity(url, { eventId: '1995040808764', eventUrl: `${url}/` }));
  assert.doesNotThrow(() => assertEventIdentity(url, { id: 1995040808764 }));
  const wrongEvent = (e: unknown) => (e as any).code === 'WRONG_EVENT' && (e as any).status === 422;
  assert.throws(() => assertEventIdentity(url, { eventId: '1995040808765', eventUrl: url }), wrongEvent);
  assert.throws(() => assertEventIdentity(url, { eventId: '1995040808764', url: 'https://evil.example/e/atlanta-handmade-food-small-business-festival-2026-tickets-1995040808764' }), wrongEvent);
  assert.throws(() => assertEventIdentity(url, { name: 'No id', eventUrl: url }), wrongEvent);
  assert.throws(() => assertEventIdentity('https://lu.ma/crowdtwin', { url: 'https://lu.ma/other' }), wrongEvent);
  assert.doesNotThrow(() => assertEventIdentity('https://lu.ma/crowdtwin', { url: 'https://lu.ma/crowdtwin' }));
});test('current actor fields preserve venue, zero coordinates, USD cents and unknown prices', () => {
  const item = {
    eventId: 'event', name: 'Test event', description: 'Public event',
    startDate: '2026-10-24T11:00:00-04:00', endDate: '2026-10-24T19:00:00-04:00',
    venueName: 'Venue', streetAddress: '1 Main Street', latitude: 0, longitude: -84,
    priceMin: 12.50, currency: 'USD', scrapedAt: '2026-10-24T18:00:00.000Z',
  };
  const e = normalizeEvidence(item, 'https://www.eventbrite.com/e/example', 'run-123');
  assert.equal(e.venueAddress, '1 Main Street'); assert.equal(e.lat, 0); assert.equal(e.lng, -84);
  assert.equal(e.ticketPriceCents, 1250); assert.equal(e.platformRsvpCount, null);
  assert.equal(e.capturedAtIso, item.scrapedAt);
  assert.equal(normalizeEvidence({ ...item, currency: 'EUR' }, e.sourceUrl, 'run-123').ticketPriceCents, null);
  assert.equal(normalizeEvidence({ ...item, priceMin: null }, e.sourceUrl, 'run-123').ticketPriceCents, null);
});
test('offline mode blocks providers even when keys exist', async () => {
  const config = providers({ OFFLINE_MODE: 'true', APIFY_API_TOKEN: 'test', ANTHROPIC_API_KEY: 'test', FACTORY_API_KEY: 'test' });
  await assert.rejects(collectLive('https://lu.ma/event', config, { collector: async () => { throw Error('must not call'); } }), e => (e as any).details.cause === 'OFFLINE_MODE');
  assert.equal((await new ClaudeService(config).draftMap(await defaultWorld())).source, 'DETERMINISTIC_FALLBACK');
});
test('missing key and deadline expose explicit fixture action without silent data', async () => {
  await assert.rejects(collectLive('https://lu.ma/event', providers({ OFFLINE_MODE: 'false' })), e => (e as any).details.cause === 'MISSING_APIFY_TOKEN');
  await assert.rejects(collectLive('https://lu.ma/event', providers({ OFFLINE_MODE: 'false', APIFY_API_TOKEN: 'test' }), {
    deadlineMs: 10, collector: () => new Promise(() => {}),
  }), e => (e as any).details.cause === 'DEADLINE_EXCEEDED');
});
test('validated captures are atomically cached and invalid data is rejected', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'crowdtwin-'));
  try {
    const config = providers({ OFFLINE_MODE: 'false', APIFY_API_TOKEN: 'test' });
    const item = await loadFixture('atl');
    const e = await collectLive('https://www.eventbrite.com/event', config, {
      cacheDir: dir, collector: async () => ({ item, runId: 'test-actor-run' }),
    });
    assert.equal(e.provenance, 'LIVE');
    assert.deepEqual(JSON.parse(await readFile(path.join(dir, 'last-live-capture.json'), 'utf8')), e);
    await assert.rejects(collectLive(e.sourceUrl, config, { cacheDir: dir, collector: async () => ({ item: {}, runId: 'test' }) }), /validated evidence/);
  } finally { await rm(dir, { recursive: true }); }
});
test('policy uses NEEDS_INPUT, REJECT, REFER, APPROVE order and explicit zero', async () => {
  const world = await defaultWorld();
  const rows = ['LOW', 'BASE', 'HIGH'].map(scenarioName => ({
    scenarioName, turnoutCount: 400, seedsRun: 15, profitableRuns: 15,
    medianRevenueCents: 500_000, medianProfitCents: 100, downsideP10ProfitCents: 0, medianBalkedQueue: 1, medianBalkedPrice: 2,
  }));
  const known = Object.fromEntries(Object.keys(unknownCosts).map(k => [k, true])) as typeof unknownCosts;
  assert.equal(riskPolicy('test', world, rows, unknownCosts).policyVerdict, 'NEEDS_INPUT');
  assert.equal(riskPolicy('test', world, rows, known).policyVerdict, 'REJECT');
  world.vendorBooth.organizerCutPct = 0;
  rows[0]!.downsideP10ProfitCents = -1_000_000;
  assert.equal(riskPolicy('test', world, rows, known).policyVerdict, 'REFER');
  rows[1]!.profitableRuns = 7;
  assert.equal(riskPolicy('test', world, rows, known).policyVerdict, 'REJECT');
  rows[1]!.profitableRuns = 8;
  rows[0]!.downsideP10ProfitCents = 0;
  assert.equal(riskPolicy('test', world, rows, known).policyVerdict, 'APPROVE');
  assert.throws(() => riskPolicy('test', world, [rows[0], rows[0], rows[0]], known));
});
test('prevalidation bounds oversized collections and deep inputs', () => {
  assert.throws(() => boundInput(Array(101).fill(null)), /Collection/);
});
