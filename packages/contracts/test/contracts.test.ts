import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WorldSpecSchema, DecisionReasonSchema } from '../src/index.js';
import { MoneySchema, canonicalJson } from '../src/validation.js';

test('frozen contracts retain their public shape', () => {
  assert.deepEqual(Object.keys(WorldSpecSchema.shape), [
    'schemaVersion', 'configHash', 'evidence', 'mapMode', 'floorplanImageUrl',
    'totalSimulatedAttendees', 'anchors', 'vendorBooth', 'personas',
  ]);
  assert.equal(DecisionReasonSchema.options.length, 6);
});
test('money rejects negative, fractional, unsafe and nonfinite values', () => {
  for (const value of [-1, 0.5, Number.MAX_SAFE_INTEGER, Infinity, NaN])
    assert.equal(MoneySchema.safeParse(value).success, false);
  assert.equal(MoneySchema.parse(0), 0);
});
test('canonical configuration order is deterministic', () => {
  assert.equal(canonicalJson({ z: [3, { b: 2, a: 1 }], a: 0 }), canonicalJson({ a: 0, z: [3, { a: 1, b: 2 }] }));
});
