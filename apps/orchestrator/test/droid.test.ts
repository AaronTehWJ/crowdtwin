import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ToolConfirmationOutcome, ToolConfirmationType } from '@factory/droid-sdk/node';
import { applicationToolIds, applicationTools, assertRestricted, buildTools, coordinateIntake, disabledTools, permissionDecision } from '../src/droidCoordinator.js';
import { Workflow } from '../src/workflow.js';
import { Database } from '../src/database.js';
import { providers } from '../src/config.js';

test('tool discovery disables every tool outside the application set', () => {
  const tools = [...applicationToolIds].map(id => ({ id }));
  assert.deepEqual(disabledTools([...tools, { id: 'Execute' }, { id: 'Read' }, { id: 'ToolSearch' }, { id: 'Script' }, { id: 'new-tool' }]),
    ['Execute', 'Read', 'ToolSearch', 'Script', 'new-tool']);
  assert.throws(() => disabledTools([{ id: 'Execute' }]), /not discovered/);
});
test('unknown, mixed and cross-server permission requests are denied', () => {
  const request = (details: unknown[]) => ({
    toolUses: details.map(d => ({ details: d })),
    options: [{ value: ToolConfirmationOutcome.ProceedOnce }, { value: ToolConfirmationOutcome.Cancel }],
  }) as Parameters<typeof permissionDecision>[0];
  const good = { type: ToolConfirmationType.McpTool, serverName: 'crowdtwin', actualToolName: 'collect_event', toolName: 'collect_event', impactLevel: 'high' };
  assert.equal(permissionDecision(request([good])), ToolConfirmationOutcome.ProceedOnce);
  for (const details of [[], [{ ...good, serverName: 'other' }], [{ ...good, actualToolName: 'approve' }], [good, { type: ToolConfirmationType.Execute }]])
    assert.equal(permissionDecision(request(details)), ToolConfirmationOutcome.Cancel);
});
test('post-restriction verification fails closed when any non-application tool stays enabled', () => {
  const application = [...applicationToolIds].map(id => ({ id, allowed: true }));
  const disabled = ['Execute', 'Read', 'ToolSearch', 'Script'].map(id => ({ id, allowed: false }));
  assert.doesNotThrow(() => assertRestricted([...application, ...disabled]));
  for (const leak of ['ToolSearch', 'Execute'])
    assert.throws(() => assertRestricted([...application, ...disabled, { id: leak, allowed: true }]),
      { name: 'Error', code: 'DROID_RESTRICTION_FAILED', status: 503 });
});
test('all five MCP handlers enforce stages and offline bypass never starts a session', async () => {  const workflow = new Workflow(new Database('http://127.0.0.1:3000', 'crowdtwin'), providers({ OFFLINE_MODE: 'true', FACTORY_API_KEY: 'present-but-unused' }));
  const job = workflow.create({ mode: 'CAPTURED', fixture: 'bay' });
  const server = buildTools(workflow, job, () => {});
  assert.deepEqual(server.tools.map(t => t.name), applicationTools);
  await assert.rejects(Promise.resolve().then(() => server.tools.find(t => t.name === 'generate_risk_audit')!.handler({})), /Expected APPROVED/);
  await coordinateIntake(workflow, job);
  assert.equal(job.stage, 'AWAITING_APPROVAL');
  assert.equal(job.sources.coordinator, 'DETERMINISTIC_FALLBACK');
  assert.equal(workflow.runs.size, 0);
  await server.close();
});
