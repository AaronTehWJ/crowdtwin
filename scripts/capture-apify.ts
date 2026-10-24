// Manual network check. Never run from npm test/verify or CI.
import { createRequire } from 'node:module';
import { readFile, rename, writeFile } from 'node:fs/promises';
import { normalizeEvidence, collectApify, validateEventUrl } from '../apps/orchestrator/src/apifyAdapter.js';
import { ValidatedEvidenceSchema } from '@crowdtwin/contracts/validation';

const require = createRequire(new URL('../apps/orchestrator/package.json', import.meta.url));
require('dotenv').config({ path: new URL('../apps/orchestrator/.env', import.meta.url), quiet: true });
const url = validateEventUrl(process.argv[2] ?? 'https://www.eventbrite.com/e/atlanta-handmade-food-small-business-festival-2026-tickets-1995040808764');
const existingRunId = process.argv[3];
const token = process.env.APIFY_API_TOKEN;
if (!token) throw new Error('APIFY_API_TOKEN is missing from apps/orchestrator/.env');
try {
  let collection;
  if (existingRunId) {
    // Recover a completed run without starting another billed actor execution.
    const { ApifyClient } = require('apify-client');
    const client = new ApifyClient({ token, maxRetries: 0, timeoutSecs: 25 });
    const run = await client.run(existingRunId).get();
    if (!run || run.status !== 'SUCCEEDED') throw new Error('The requested run has not succeeded');
    const record = await client.keyValueStore(run.defaultKeyValueStoreId).getRecord('INPUT');
    const urls = (record?.value as { startUrls?: unknown[] })?.startUrls;
    if (!urls?.some(value => typeof value === 'string' && validateEventUrl(value) === url))
      throw new Error('The requested run does not match the event URL');
    const { items } = await client.dataset(run.defaultDatasetId).listItems({ limit: 1 });
    if (!items[0]) throw new Error('The successful run returned an empty dataset; fixture unchanged');
    collection = { item: items[0], runId: run.id, datasetId: run.defaultDatasetId };
  } else {
    collection = await collectApify(url, token, 120);
  }
  const itemUrl = collection.item.eventUrl ?? collection.item.url;
  if (itemUrl && validateEventUrl(itemUrl) !== url) throw new Error('Dataset item does not match the requested event URL');
  const evidence = ValidatedEvidenceSchema.parse({ ...normalizeEvidence(collection.item, url, collection.runId), provenance: 'CAPTURED' });
  // Preserve the original modeled fixture for deterministic regression gates.
  const demo = new URL('../fixtures/modeled-atl-event.json', import.meta.url);
  await readFile(demo);
  const target = new URL('../fixtures/captured-event.json', import.meta.url);
  const temporary = new URL('../fixtures/.last-live-capture-promote.tmp', import.meta.url);
  await writeFile(temporary, `${JSON.stringify(evidence, null, 2)}\n`, { mode: 0o600 });
  await rename(temporary, target);
  await writeFile(new URL('../fixtures/captured-event.provenance.json', import.meta.url), `${JSON.stringify({
    actor: 'memo23/eventbrite-scraper', actorRunId: collection.runId, datasetId: collection.datasetId,
    sourceUrl: url, capturedAtIso: evidence.capturedAtIso, normalizedItemCount: 1,
  }, null, 2)}\n`);
  console.log(JSON.stringify({ saved: 'fixtures/captured-event.json', runId: collection.runId, datasetId: collection.datasetId, durationHours: evidence.durationHours }));
} catch (error) {
  // SDK errors can include request headers/URLs: print no raw provider errors.
  console.error(error instanceof Error && error.name === 'ZodError'
    ? 'Captured evidence failed validation; inspect the event dates and normalization. No replacement was saved.'
    : 'Apify capture failed or returned incompatible data. Check the run in Apify Console; no synthetic data was substituted.');
  process.exitCode = 1;
}
