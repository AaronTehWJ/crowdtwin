import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Workflow } from '../src/workflow.js';
import { Database } from '../src/database.js';
import { providers } from '../src/config.js';

test('stage-gated handlers cannot draft, submit, audit or approve early', async () => {
  const workflow = new Workflow(new Database('http://127.0.0.1:3000', 'crowdtwin'), providers({}));
  const job = workflow.create({ mode: 'CAPTURED', fixture: 'atl' });
  await assert.rejects(workflow.draftMap(job), /Expected EVIDENCE_READY/);
  await assert.rejects(workflow.draftPersonas(job), /Expected MAP_READY/);
  await assert.rejects(workflow.submit(job), /Expected PERSONAS_READY/);
  await assert.rejects(workflow.approve(job.id, {}), /Expected AWAITING_APPROVAL/);
  await assert.rejects(workflow.audit('unknown'), /no human approval/);
  await workflow.intake(job);
  assert.equal(job.stage, 'AWAITING_APPROVAL');
  assert.equal(workflow.runs.size, 0);
});

test('database accepts configured remote origins but rejects credentials and URL suffixes', () => {
  assert.doesNotThrow(() => new Database('https://maincloud.spacetimedb.com', 'crowdtwin'));
  for (const uri of ['file:///tmp/db', 'https://user:secret@server.example', 'https://server.example/path', 'https://server.example?token=x'])
    assert.throws(() => new Database(uri, 'crowdtwin'), /HTTP\(S\)/);
});
