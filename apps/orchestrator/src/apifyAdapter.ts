import { ApifyClient } from 'apify-client';
import { readFile, writeFile, rename, unlink } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { ValidatedEvidenceSchema, ValidatedWorldSchema } from '@crowdtwin/contracts/validation';
import type { EventEvidence, WorldSpec } from '@crowdtwin/contracts';
import { fixtureDir, type ProviderConfig } from './config.js';
import { AppError, boundInput } from './errors.js';

export const fixtureNames = { atl: 'captured-event.json', bay: 'bay-area-event.json' } as const;
export type FixtureName = keyof typeof fixtureNames;
export function validateEventUrl(input: string): string {
  if (input.length > 2048) throw new AppError(400, 'INVALID_URL', 'URL is too long');
  let url: URL;
  try { url = new URL(input); } catch { throw new AppError(400, 'INVALID_URL', 'Enter a valid event URL'); }
  if (url.protocol !== 'https:' || !['eventbrite.com', 'www.eventbrite.com', 'lu.ma', 'luma.com'].includes(url.hostname) ||
      url.username || url.password || url.port) {
    throw new AppError(400, 'INVALID_URL', 'Use HTTPS on an exact supported event host, without credentials or custom ports');
  }
  url.hash = '';
  return url.href;
}
export async function loadFixture(name: FixtureName): Promise<EventEvidence> {
  if (!(name in fixtureNames)) throw new AppError(400, 'INVALID_FIXTURE', 'Unknown fixture');
  return ValidatedEvidenceSchema.parse(JSON.parse(await readFile(path.join(fixtureDir, fixtureNames[name]), 'utf8')));
}
export async function defaultWorld(evidence?: EventEvidence): Promise<WorldSpec> {
  const world = JSON.parse(await readFile(path.join(fixtureDir, 'default-world-spec.json'), 'utf8'));
  if (evidence) world.evidence = evidence;
  return ValidatedWorldSchema.parse(world);
}

export class CollectionError extends AppError {
  constructor(cause: string) {
    super(503, 'COLLECTION_TIMEOUT', 'Live collection did not produce validated evidence', {
      cause, fixtureAction: 'Load Captured Demo Fixture (CAPTURED mode)',
    });
  }
}

type Collection = { runId: string; item: Record<string, any> };
export type Collector = (url: string, token: string) => Promise<Collection>;
const collect: Collector = async (url, token) => {
  const client = new ApifyClient({ token, maxRetries: 0, timeoutSecs: 25 });
  const run = await client.actor('memo23/eventbrite-scraper').call({
    startUrls: [{ url }], maxItems: 1, enrichOrganizer: false,
    harvestOrganizerEmails: false, monitoringMode: false,
  }, { timeout: 25, waitSecs: 25, log: null });
  if (run.status !== 'SUCCEEDED') {
    await client.run(run.id).abort().catch(() => undefined);
    throw new CollectionError('ACTOR_NOT_SUCCEEDED');
  }
  const { items } = await client.dataset(run.defaultDatasetId).listItems({ limit: 1 });
  if (!items[0]) throw new CollectionError('EMPTY_DATASET');
  return { runId: run.id, item: items[0] };
};

export function normalizeEvidence(item: Record<string, any>, url: string, runId: string): EventEvidence {
  boundInput(item);
  const startIso = item.startIso ?? item.start?.utc ?? item.startDate;
  const endIso = item.endIso ?? item.end?.utc ?? item.endDate;
  const text = (value: any): string => typeof value === 'string' ? value : value?.text ?? '';
  const evidence = {
    eventId: String(item.eventId ?? item.id ?? ''),
    sourceUrl: url, provenance: 'LIVE', capturedAtIso: new Date().toISOString(), actorRunId: runId,
    title: text(item.title ?? item.name), description: text(item.description).slice(0, 12_000),
    startIso, endIso, durationHours: (Date.parse(endIso) - Date.parse(startIso)) / 3_600_000,
    venueName: item.venueName ?? item.venue?.name ?? '',
    venueAddress: item.venueAddress ?? item.venue?.address?.localized_address_display ?? '',
    lat: item.lat ?? (item.venue?.latitude ? Number(item.venue.latitude) : null),
    lng: item.lng ?? (item.venue?.longitude ? Number(item.venue.longitude) : null),
    ticketPriceCents: item.ticketPriceCents ?? null,
    platformRsvpCount: item.platformRsvpCount ?? null,
    organizerClaimedAttendance: item.organizerClaimedAttendance ?? null,
    nearbyCompetitorPriceBands: item.nearbyCompetitorPriceBands ?? [],
  };
  return ValidatedEvidenceSchema.parse(evidence);
}

export async function collectLive(urlInput: string, config: ProviderConfig, options: {
  collector?: Collector; deadlineMs?: number; cacheDir?: string;
} = {}): Promise<EventEvidence> {
  const url = validateEventUrl(urlInput);
  if (config.offline) throw new CollectionError('OFFLINE_MODE');
  if (!config.apifyToken) throw new CollectionError('MISSING_APIFY_TOKEN');
  let expired = false;
  let timer: ReturnType<typeof setTimeout>;
  const work = async () => {
    const { item, runId } = await (options.collector ?? collect)(url, config.apifyToken!);
    if (expired) throw new CollectionError('DEADLINE_EXCEEDED');
    let evidence: EventEvidence;
    try { evidence = normalizeEvidence(item, url, runId); }
    catch { throw new CollectionError('INVALID_EVIDENCE'); }
    const dir = options.cacheDir ?? fixtureDir;
    const temporary = path.join(dir, `.last-live-capture-${randomUUID()}.tmp`);
    try {
      await writeFile(temporary, `${JSON.stringify(evidence, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
      if (expired) throw new CollectionError('DEADLINE_EXCEEDED');
      await rename(temporary, path.join(dir, 'last-live-capture.json'));
    } finally { await unlink(temporary).catch(() => undefined); }
    return evidence;
  };
  try {
    return await Promise.race([
      work(),
      new Promise<never>((_, reject) => { timer = setTimeout(() => { expired = true; reject(new CollectionError('DEADLINE_EXCEEDED')); }, options.deadlineMs ?? 25_000); }),
    ]);
  } catch (error) {
    if (error instanceof CollectionError) throw error;
    throw new CollectionError('PROVIDER_FAILURE');
  } finally { clearTimeout(timer!); }
}
