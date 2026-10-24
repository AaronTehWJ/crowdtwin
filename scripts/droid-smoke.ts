import assert from 'node:assert/strict';
import { Database } from '../apps/orchestrator/src/database.js';
import { Workflow } from '../apps/orchestrator/src/workflow.js';
import { providers } from '../apps/orchestrator/src/config.js';
import { coordinateIntake, closeCoordinators } from '../apps/orchestrator/src/droidCoordinator.js';

if (!process.env.FACTORY_API_KEY) throw new Error('FACTORY_API_KEY is absent; credentialed smoke check cannot run');
const workflow = new Workflow(new Database('http://127.0.0.1:3000', 'crowdtwin'), {
  ...providers(), offline: false, apifyToken: undefined, anthropicKey: undefined,
});
const job = workflow.create({ mode: 'CAPTURED', fixture: 'demo' });
try {
  await coordinateIntake(workflow, job);
  assert.equal(job.stage, 'AWAITING_APPROVAL', JSON.stringify(job.error));
  assert.equal(job.sources.coordinator, 'FACTORY_DROID');
  assert.equal(workflow.runs.size, 0);
  console.log(JSON.stringify({ gate: 'passed', coordinator: job.sources.coordinator, milestones: job.milestones, initializedRuns: workflow.runs.size }));
} finally { await closeCoordinators(); }
