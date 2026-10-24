import assert from 'node:assert/strict';

const base = 'http://localhost:4000/api';
async function request(path: string, body?: unknown, status = 200) {
  const r = await fetch(`${base}${path}`, body === undefined ? {} : {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const value = await r.json() as any;
  assert.equal(r.status, status, JSON.stringify(value));
  return value;
}
async function awaitStage(id: string, stage: string) {
  const response = await fetch(`${base}/jobs/${id}/events`, { signal: AbortSignal.timeout(10_000) });
  const reader = response.body!.getReader();
  let pending = '';
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) throw Error('SSE ended before expected milestone');
      pending += new TextDecoder().decode(value);
      if (pending.includes(`"stage":"${stage}"`)) return;
      if (pending.includes('"stage":"ERROR"')) throw Error(pending);
    }
  } finally { await reader.cancel(); }
}
const health = await request('/health');
assert.equal(health.ok, true);
assert.equal(health.offline, true);
await request('/runs/gate-baseline/step', { steps: 1 }, 409);
await request('/jobs', { mode: 'LIVE', url: 'https://eventbrite.com.attacker.example/' }, 400);
const live = await request('/jobs', { mode: 'LIVE', url: 'https://www.eventbrite.com/' }, 202);
await awaitStage(live.id, 'COLLECTION_TIMEOUT');
const failure = await request(`/jobs/${live.id}`);
assert.equal(failure.error.details.cause, 'OFFLINE_MODE');
assert.match(failure.error.details.fixtureAction, /Load Captured/);
const job = await request('/jobs', { mode: 'CAPTURED', fixture: 'atl' }, 202);
await awaitStage(job.id, 'AWAITING_APPROVAL');
const draft = await request(`/jobs/${job.id}`);
const forged = structuredClone(draft.world);
forged.evidence.provenance = 'MANUAL';
await request(`/jobs/${job.id}/approve`, { world: forged }, 400);
const costs = { unitCogsCents: true, boothFeeCents: true, staffAndEquipmentCents: true, organizerCutPct: true };
draft.world.configHash = 'untrusted-client-hash';
const approved = await request(`/jobs/${job.id}/approve`, { world: draft.world, costs });
assert.notEqual(approved.world.configHash, 'untrusted-client-hash');
assert.equal(approved.run.simTimeSec, 0);
await request(`/jobs/${job.id}/approve`, { world: draft.world, costs }, 409);
await request(`/runs/${approved.runId}/variants`, { relocate: true, addServer: true, capInventory: true }, 409);
await Promise.all([request(`/runs/${approved.runId}/step`, { steps: 10 }), request(`/runs/${approved.runId}/step`, { steps: 10 })]);
assert.equal((await request(`/runs/${approved.runId}`)).run.simTimeSec, 600);
await request(`/runs/${approved.runId}/step`, { steps: 0 }, 400);
const completed = await request(`/runs/${approved.runId}/step`, { steps: 1440 });
assert.equal(completed.run.status, 'COMPLETED');
const variant = await request(`/runs/${approved.runId}/variants`, { relocate: true, addServer: true, capInventory: true });
assert.equal(variant.seed, completed.run.seed);
assert.equal(variant.variant.run.simTimeSec, completed.run.simTimeSec);
assert.equal(variant.variant.booth.totalInventoryOutlayCents, 450_000);
assert.equal(variant.variant.booth.staffEquipmentCents, completed.booth.staffEquipmentCents + 30_000);
const eventsResponse = await fetch('http://127.0.0.1:3000/v1/database/crowdtwin/sql', {
  method: 'POST', body: `SELECT event_id FROM decision_event WHERE run_id = '${approved.runId}'`,
});
const [events] = await eventsResponse.json() as any[];
assert(events.rows.length > 0);
const explanation = await request(`/runs/${approved.runId}/explain`, { eventId: events.rows[0][0] });
assert.equal(explanation.source, 'DETERMINISTIC_FALLBACK');
assert.equal(explanation.event.runId, approved.runId);
for (const value of [explanation.event.observedPriceCents, explanation.event.agentWalletCents, explanation.event.estimatedWaitSec, explanation.event.agentPatienceSec])
  assert(explanation.explanation.includes(String(value)));
await request(`/runs/${variant.runId}/explain`, { eventId: explanation.event.eventId }, 404);
const audit = await request(`/runs/${approved.runId}/audit`);
assert.equal(audit.policyVerdict, 'REJECT');
assert.equal(audit.scenarios.length, 3);
const replay = await fetch(`${base}/jobs/${job.id}/events`, { headers: { 'Last-Event-ID': '3' } });
const reader = replay.body!.getReader();
const chunk = new TextDecoder().decode((await reader.read()).value);
await reader.cancel();
assert(chunk.startsWith('id: 4\n'));
const foreignOrigin = await fetch(`${base}/jobs`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://attacker.example' }, body: '{}' });
assert.equal(foreignOrigin.status, 403);
console.log(JSON.stringify({ gate: 'passed', health, baseline: completed.booth, variant: variant.variant.booth, verdict: audit.policyVerdict }, null, 2));
