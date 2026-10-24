import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { ValidatedEvidenceSchema, ValidatedWorldSchema, hashWorld } from '../src/validation.js';
import type { WorldSpec } from '../src/index.js';

const fixture = async (name: string) =>
  JSON.parse(await readFile(new URL(`../../../fixtures/${name}.json`, import.meta.url), 'utf8'));
const world = () => fixture('default-world-spec') as Promise<WorldSpec>;

test('bundled evidence is explicit modeled data without fabricated actor IDs', async () => {
  for (const name of ['modeled-atl-event', 'bay-area-event']) {
    const e = ValidatedEvidenceSchema.parse(await fixture(name));
    assert.equal(e.provenance, 'CAPTURED');
    assert.equal(e.actorRunId, null);
    assert.match(e.description, /not a verified live capture/);
  }
});
test('world validates, hashes consistently and splits the capital assumptions', async () => {
  const w = ValidatedWorldSchema.parse(await world());
  assert.equal(w.totalSimulatedAttendees, 400);
  assert.deepEqual(w.evidence, await fixture('modeled-atl-event'));
  assert.equal(w.configHash, await hashWorld(w));
  assert.equal(await hashWorld({ ...w, configHash: 'untrusted' }), w.configHash);
  const b = w.vendorBooth;
  assert.equal(b.inventoryUnits * b.unitCogsCents + b.staffAndEquipmentCents + b.boothFeeCents, 2_300_000);
  const changed = structuredClone(w);
  changed.vendorBooth.x++;
  assert.notEqual(await hashWorld(changed), w.configHash);
});
test('real capture retains run provenance and supports its full multi-day horizon', async () => {
  const e = ValidatedEvidenceSchema.parse(await fixture('captured-event'));
  const metadata = await fixture('captured-event.provenance');
  assert.equal(e.provenance, 'CAPTURED');
  assert.equal(e.actorRunId, metadata.actorRunId);
  assert.ok(e.actorRunId && metadata.datasetId);
  assert.equal(e.durationHours, (Date.parse(e.endIso) - Date.parse(e.startIso)) / 3_600_000);
  assert.equal(ValidatedWorldSchema.safeParse({ ...await world(), evidence: e }).success, true);
  const tooLong = { ...e, endIso: new Date(Date.parse(e.startIso) + 73 * 3_600_000).toISOString(), durationHours: 73 };
  assert.equal(ValidatedEvidenceSchema.safeParse(tooLong).success, false);
});
test('companion validation rejects incoherent or unbounded worlds', async () => {
  const original = await world();
  const changes: ((w: WorldSpec) => void)[] = [
    w => { w.vendorBooth.prepTimeSec = 0; },
    w => { w.vendorBooth.boothFeeCents = -1; },
    w => { w.vendorBooth.unitCogsCents = Number.MAX_SAFE_INTEGER; },
    w => { w.evidence.endIso = w.evidence.startIso; },
    w => { w.evidence.durationHours = 4; },
    w => { w.personas[0]!.weight = 1; },
    w => { w.personas[0]!.walletMaxCents = 0; },
    w => { w.anchors[0]!.id = w.anchors[1]!.id; },
    w => { w.personas = []; },
    w => { w.mapMode = 'INDOOR_IMAGE'; },
    w => { w.floorplanImageUrl = 'https://tracking.example/image.png'; },
    w => { w.evidence.provenance = 'LIVE'; },
  ];
  for (const change of changes) {
    const w = structuredClone(original);
    change(w);
    assert.equal(ValidatedWorldSchema.safeParse(w).success, false, change.toString());
  }
});
