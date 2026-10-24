import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile } from 'node:fs/promises';
import { DbConnection } from '../apps/orchestrator/src/module_bindings/index.js';

const execute = promisify(execFile);
const uri = 'http://127.0.0.1:3000';
const cli = process.env.SPACETIME_CLI ?? `${process.env.HOME}/.local/bin/spacetime`;
const world = JSON.parse(await readFile(new URL('../fixtures/default-world-spec.json', import.meta.url), 'utf8'));
async function call(name: string, ...args: unknown[]) {
  await execute(cli, ['call', '--server', uri, 'crowdtwin', name, ...args.map(x => JSON.stringify(x))], { timeout: 120_000 });
}
async function sql(query: string): Promise<Record<string, any>[]> {
  const r = await fetch(`${uri}/v1/database/crowdtwin/sql`, { method: 'POST', body: query });
  assert.equal(r.status, 200, await r.clone().text());
  const [result] = await r.json() as any[];
  return result.rows.map((row: unknown[]) => Object.fromEntries(result.schema.elements.map((e: any, i: number) => [e.name.some, row[i]])));
}

await call('init_world', 'gate-baseline', JSON.stringify(world), 42);
await call('init_world', 'gate-variant', JSON.stringify(world), 42);
const agents = await sql("SELECT * FROM customer_agent WHERE run_id = 'gate-baseline'");
assert.equal(agents.length, 400);
const paired = await sql("SELECT * FROM customer_agent WHERE run_id = 'gate-variant'");
assert.deepEqual(agents.map(a => [a.agent_id, a.initial_wallet_cents, a.arrival_sec, a.max_wait_sec]).sort(),
  paired.map(a => [a.agent_id, a.initial_wallet_cents, a.arrival_sec, a.max_wait_sec]).sort());
await call('step_simulation', 'gate-baseline', 960);
for (let i = 0; i < 4; i++) await call('step_simulation', 'gate-variant', 240);
const [baseline] = await sql("SELECT * FROM booth WHERE run_id = 'gate-baseline'");
const [variant] = await sql("SELECT * FROM booth WHERE run_id = 'gate-variant'");
for (const field of ['units_sold', 'gross_revenue_cents', 'net_profit_cents', 'cash_balance_cents', 'balked_queue_count']) assert.equal(baseline![field], variant![field]);
assert.equal(baseline!.net_profit_cents - baseline!.cash_balance_cents, baseline!.remaining_inventory * baseline!.unit_cogs_cents);
await call('run_batch_scenarios', 'gate-baseline', JSON.stringify(world));
const scenarios = await sql("SELECT * FROM scenario_result WHERE run_id = 'gate-baseline'");
assert.equal(scenarios.length, 3);
assert.equal(scenarios.reduce((n, s) => n + s.seeds_run, 0), 45);
await call('init_world', 'gate-variant', JSON.stringify(world), 42);
assert.deepEqual(await sql("SELECT * FROM booth WHERE run_id = 'gate-baseline'"), [baseline]);
assert.deepEqual(await sql("SELECT * FROM scenario_result WHERE run_id = 'gate-baseline'"), scenarios);
await assert.rejects(execute(cli, ['call', '--server', uri, '--anonymous', 'crowdtwin', 'step_simulation', '"gate-baseline"', '1']), /Only the local orchestration identity/);
await assert.rejects(call('run_batch_scenarios', 'gate-baseline', JSON.stringify({ ...world, totalSimulatedAttendees: 500 })), /must equal/);

// Verify that the generated 1.12 client receives public subscriptions.
const connection = await new Promise<DbConnection>((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error('Subscription timed out')), 10_000);
  DbConnection.builder().withUri(uri).withModuleName('crowdtwin')
    .onConnect(conn => conn.subscriptionBuilder().onApplied(() => { clearTimeout(timer); resolve(conn); })
      .subscribe(["SELECT * FROM customer_agent WHERE run_id = 'gate-baseline'", "SELECT * FROM booth WHERE run_id = 'gate-baseline'"]))
    .onConnectError((_ctx, error) => { clearTimeout(timer); reject(error); }).build();
});
assert.equal([...connection.db.customerAgent.iter()].length, 400);
assert.equal([...connection.db.booth.iter()][0]!.netProfitCents, BigInt(baseline!.net_profit_cents));
connection.disconnect();
console.log(JSON.stringify({ gate: 'passed', baseline, scenarios }, null, 2));
